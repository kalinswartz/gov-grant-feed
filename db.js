const {
  User,
  Opportunity,
  FetchLog,
  Interest,
  Conversation,
  Participant,
  Message,
} = require("./lib/models");

const db = {

  /* ════════════════════════════
     Users
  ════════════════════════════ */
  users: {
    async findByUsername(username) {
      return User.findOne({
        username: new RegExp(`^${username}$`, "i"),
      }).lean();
    },

    async findById(id) {
      try {
        return await User.findById(id).lean();
      } catch {
        return null;
      }
    },

    async create(username, hashedPassword) {
      const exists = await User.findOne({
        username: new RegExp(`^${username}$`, "i"),
      });
      if (exists) throw new Error("Username already taken");

      const user = await User.create({ username, password: hashedPassword });
      return user.toObject();
    },

    async getAll() {
      const users = await User.find({}, { password: 0 }).lean();
      return users.map((u) => ({
        id:           u._id,
        username:     u.username,
        role:         u.role,
        created_at:   u.created_at,
        display_name: u.display_name || "",
        company:      u.company      || "",
        job_title:    u.job_title    || "",
        department:   u.department   || "",
        email:        u.email        || "",
        location:     u.location     || "",
      }));
    },

    async getProfile(id) {
      try {
        const user = await User.findById(id, { password: 0 }).lean();
        if (!user) return null;
        return { ...user, id: user._id };
      } catch {
        return null;
      }
    },

    async getPublicProfile(id) {
      try {
        const user = await User.findById(id, { password: 0 }).lean();
        if (!user) return null;
        return {
          id:           user._id,
          username:     user.username,
          display_name: user.display_name || "",
          company:      user.company      || "",
          job_title:    user.job_title    || "",
          department:   user.department   || "",
          email:        user.email        || "",
          location:     user.location     || "",
          bio:          user.bio          || "",
          role:         user.role,
          created_at:   user.created_at,
        };
      } catch {
        return null;
      }
    },

    async updateProfile(id, fields) {
      const allowed = [
        "display_name", "company", "job_title",
        "department", "email", "phone", "location", "bio",
      ];
      const update = { updated_at: new Date() };
      allowed.forEach((f) => {
        if (fields[f] !== undefined) {
          update[f] = String(fields[f]).trim().slice(0, 200);
        }
      });

      const user = await User.findByIdAndUpdate(id, update, { new: true }).lean();
      if (!user) throw new Error("User not found");
      return { ...user, id: user._id };
    },

    async updatePassword(id, hashedPassword) {
      const user = await User.findByIdAndUpdate(id, {
        password:   hashedPassword,
        updated_at: new Date(),
      });
      if (!user) throw new Error("User not found");
      return true;
    },

    async delete(id) {
      try {
        const result = await User.deleteOne({ _id: id });
        return result.deletedCount > 0;
      } catch {
        return false;
      }
    },

    async updateRole(id, role) {
      const user = await User.findByIdAndUpdate(
        id, { role }, { new: true }
      ).lean();
      if (!user) throw new Error("User not found");
      return { ...user, id: user._id };
    },
  },

  /* ════════════════════════════
     Interests
  ════════════════════════════ */
  interests: {
    async toggle(userId, opportunityId) {
      const existing = await Interest.findOne({
        user_id:        userId,
        opportunity_id: opportunityId,
      });

      if (existing) {
        await Interest.deleteOne({ _id: existing._id });
        return { interested: false };
      } else {
        await Interest.create({
          user_id:        userId,
          opportunity_id: opportunityId,
        });
        return { interested: true };
      }
    },

    async isInterested(userId, opportunityId) {
      const exists = await Interest.findOne({
        user_id:        userId,
        opportunity_id: opportunityId,
      });
      return !!exists;
    },

    async getInterestedUsers(opportunityId) {
      const interests = await Interest.find({
        opportunity_id: opportunityId,
      }).lean();

      const profiles = await Promise.all(
        interests.map((i) => db.users.getPublicProfile(i.user_id))
      );

      return profiles
        .filter(Boolean)
        .map((p, idx) => ({
          ...p,
          interested_at: interests[idx].created_at,
        }));
    },

    async getByUser(userId) {
      const interests = await Interest.find({ user_id: userId }).lean();
      return interests.map((i) => String(i.opportunity_id));
    },

    async getCounts(opportunityIds) {
      const counts = {};
      await Promise.all(
        opportunityIds.map(async (id) => {
          counts[String(id)] = await Interest.countDocuments({
            opportunity_id: id,
          });
        })
      );
      return counts;
    },
  },

  /* ════════════════════════════
     Messaging
  ════════════════════════════ */
  messaging: {
    async findDirectConversation(userIdA, userIdB) {
      const userAConvos = await Participant.find({
        user_id: userIdA,
      }).distinct("conversation_id");

      for (const convId of userAConvos) {
        const members   = await Participant.find({ conversation_id: convId }).lean();
        const memberIds = members.map((m) => String(m.user_id));
        if (
          memberIds.length === 2 &&
          memberIds.includes(String(userIdA)) &&
          memberIds.includes(String(userIdB))
        ) {
          return convId;
        }
      }
      return null;
    },

    async getOrCreateConversation(userIdA, userIdB) {
      const existing = await db.messaging.findDirectConversation(
        userIdA,
        userIdB
      );

      if (existing) {
        // Restore for either user that had soft deleted
        await Participant.updateMany(
          {
            conversation_id: existing,
            deleted_at:      { $ne: null },
          },
          { deleted_at: null }
        );
        return existing;
      }

      const conv = await Conversation.create({});
      await Participant.insertMany([
        { conversation_id: conv._id, user_id: userIdA },
        { conversation_id: conv._id, user_id: userIdB },
      ]);
      return conv._id;
    },

    async getConversationsForUser(userId) {
      const myParts = await Participant.find({
        user_id:    userId,
        deleted_at: null,
      }).lean();

      const convos = await Promise.all(
        myParts.map(async (myPart) => {
          const convId = myPart.conversation_id;
          const conv   = await Conversation.findById(convId).lean();
          if (!conv) return null;

          const otherParts = await Participant.find({
            conversation_id: convId,
            user_id:         { $ne: userId },
          }).lean();

          const otherUsers = await Promise.all(
            otherParts.map((p) => db.users.getPublicProfile(p.user_id))
          );

          const lastMessage = await Message.findOne({
            conversation_id: convId,
            is_deleted:      false,
          })
            .sort({ created_at: -1 })
            .lean();

          const lastRead = new Date(myPart.last_read_at || 0);
          const unread   = await Message.countDocuments({
            conversation_id: convId,
            sender_id:       { $ne: userId },
            is_deleted:      false,
            created_at:      { $gt: lastRead },
          });

          return {
            id:           convId,
            created_at:   conv.created_at,
            updated_at:   conv.updated_at,
            other_users:  otherUsers.filter(Boolean),
            last_message: lastMessage,
            unread_count: unread,
          };
        })
      );

      return convos
        .filter(Boolean)
        .sort((a, b) => {
          const aTime = a.last_message?.created_at || a.updated_at;
          const bTime = b.last_message?.created_at || b.updated_at;
          return new Date(bTime) - new Date(aTime);
        });
    },

    async isParticipant(userId, conversationId) {
      try {
        const p = await Participant.findOne({
          user_id:         userId,
          conversation_id: conversationId,
        });
        return !!p;
      } catch {
        return false;
      }
    },

    async sendMessage(conversationId, senderId, content) {
      const isParticipant = await db.messaging.isParticipant(
        senderId,
        conversationId
      );
      if (!isParticipant) {
        throw new Error("Not a participant in this conversation");
      }

      const msg = await Message.create({
        conversation_id: conversationId,
        sender_id:       senderId,
        content:         String(content).trim().slice(0, 5000),
      });

      await Conversation.findByIdAndUpdate(conversationId, {
        updated_at: new Date(),
      });

      const sender = await db.users.getPublicProfile(senderId);
      return { ...msg.toObject(), sender };
    },

    async getMessages(conversationId, limit = 50, offset = 0) {
      const total = await Message.countDocuments({
        conversation_id: conversationId,
        is_deleted:      false,
      });

      const msgs = await Message.find({
        conversation_id: conversationId,
        is_deleted:      false,
      })
        .sort({ created_at: 1 })
        .skip(offset)
        .limit(limit)
        .lean();

      const withSenders = await Promise.all(
        msgs.map(async (m) => {
          const sender = await db.users.getPublicProfile(m.sender_id);
          return { ...m, id: m._id, sender };
        })
      );

      return { messages: withSenders, total };
    },

    async editMessage(messageId, userId, newContent) {
      const msg = await Message.findById(messageId);
      if (!msg) throw new Error("Message not found");
      if (String(msg.sender_id) !== String(userId)) {
        throw new Error("Cannot edit someone else's message");
      }
      if (msg.is_deleted) throw new Error("Cannot edit a deleted message");

      msg.content   = String(newContent).trim().slice(0, 5000);
      msg.edited_at = new Date();
      await msg.save();

      const sender = await db.users.getPublicProfile(userId);
      return { ...msg.toObject(), id: msg._id, sender };
    },

    async deleteMessage(messageId, userId) {
      const msg = await Message.findById(messageId);
      if (!msg) throw new Error("Message not found");
      if (String(msg.sender_id) !== String(userId)) {
        throw new Error("Cannot delete someone else's message");
      }

      msg.is_deleted = true;
      msg.deleted_at = new Date();
      await msg.save();
      return { success: true };
    },

    async markAsRead(conversationId, userId) {
      await Participant.findOneAndUpdate(
        { conversation_id: conversationId, user_id: userId },
        { last_read_at: new Date() }
      );
      return { success: true };
    },

    async getTotalUnread(userId) {
      const myParts = await Participant.find({
        user_id:    userId,
        deleted_at: null,
      }).lean();

      let total = 0;
      await Promise.all(
        myParts.map(async (p) => {
          const count = await Message.countDocuments({
            conversation_id: p.conversation_id,
            sender_id:       { $ne: userId },
            is_deleted:      false,
            created_at:      { $gt: new Date(p.last_read_at || 0) },
          });
          total += count;
        })
      );
      return total;
    },

    async deleteConversation(conversationId, userId) {
      const participant = await Participant.findOne({
        conversation_id: conversationId,
        user_id:         userId,
      });
      if (!participant) {
        throw new Error("Not a participant in this conversation");
      }

      participant.deleted_at = new Date();
      await participant.save();
      return { success: true };
    },
  },

  /* ════════════════════════════
     Opportunities / Feed
  ════════════════════════════ */
  opportunities: {
    async upsert(obj) {
      const filter = {
        source:      obj.source,
        external_id: obj.external_id,
      };

      const existing = await Opportunity.findOne(filter).lean();

      if (existing) {
        const existingKw = new Set(
          (existing.matched_keywords || "").split(", ").filter(Boolean)
        );
        const newKw = (obj.matched_keywords || "").split(", ").filter(Boolean);
        newKw.forEach((k) => existingKw.add(k));

        await Opportunity.findOneAndUpdate(filter, {
          ...obj,
          matched_keywords: [...existingKw].join(", "),
        });
              } else {
        await Opportunity.create({
          ...obj,
          fetched_at: new Date().toISOString(),
        });
      }
    },

    async find(filters = {}) {
      const query = {};
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (filters.source) query.source = filters.source;

      if (filters.search) {
        query.$or = [
          { title:   new RegExp(filters.search, "i") },
          { summary: new RegExp(filters.search, "i") },
          { agency:  new RegExp(filters.search, "i") },
        ];
      }

      if (filters.agency) {
        query.agency = new RegExp(filters.agency, "i");
      }

      // Filter out expired grants
      query.$or = query.$or || [];
      const dateFilter = {
        $or: [
          { close_date: null },
          { close_date: "" },
          { close_date: { $gte: today.toISOString().split("T")[0] } },
        ],
      };

      let sort = { fetched_at: -1 };
      if (filters.sort === "close_date") {
        sort = { close_date: 1 };
      }

      const total = await Opportunity.countDocuments({ ...query, ...dateFilter });
      const rows  = await Opportunity.find({ ...query, ...dateFilter })
        .sort(sort)
        .skip(filters.offset || 0)
        .limit(filters.limit || 20)
        .lean();

      return {
        total,
        rows: rows.map((r) => ({ ...r, id: r._id })),
      };
    },

    async findById(id) {
      try {
        const opp = await Opportunity.findById(id).lean();
        if (!opp) return null;
        return { ...opp, id: opp._id };
      } catch {
        return null;
      }
    },

    async getAgencies() {
      const aggs = await Opportunity.aggregate([
        { $match: { agency: { $nin: [null, ""] } } },
        { $group: { _id: "$agency", count: { $sum: 1 } } },
        { $sort:  { count: -1 } },
        { $project: { agency: "$_id", count: 1, _id: 0 } },
      ]);
      return aggs;
    },

    async getStats() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();

      const total    = await Opportunity.countDocuments();
      const newToday = await Opportunity.countDocuments({
        fetched_at: { $gte: todayStr },
      });
      const bySource = await Opportunity.aggregate([
        { $group: { _id: "$source", count: { $sum: 1 } } },
        { $project: { source: "$_id", count: 1, _id: 0 } },
      ]);

      return { total, newToday, bySource };
    },
  },

  /* ════════════════════════════
     Fetch Log
  ════════════════════════════ */
  fetchLog: {
    async insert(ran_at, source, status, countOrError) {
      if (status === "error") {
        await FetchLog.create({ ran_at, source, status, error: countOrError });
      } else {
        await FetchLog.create({ ran_at, source, status, count: countOrError });
      }
    },

    async getLast() {
      return FetchLog.findOne().sort({ ran_at: -1 }).lean();
    },

    async getAll() {
      return FetchLog.find().sort({ ran_at: -1 }).limit(50).lean();
    },
  },
};

module.exports = db;
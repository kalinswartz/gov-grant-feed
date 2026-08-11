const fs   = require("fs");
const path = require("path");

const DB_PATH       = path.join(__dirname, "grants.json");
const USERS_PATH    = path.join(__dirname, "users.json");
const INTEREST_PATH = path.join(__dirname, "interests.json");
const MESSAGES_PATH = path.join(__dirname, "messages.json");  // ← ADD THIS

/* ── Grants DB ── */
function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    const empty = { opportunities: [], fetch_log: [], next_id: 1 };
    fs.writeFileSync(DB_PATH, JSON.stringify(empty, null, 2));
    return empty;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    const empty = { opportunities: [], fetch_log: [], next_id: 1 };
    fs.writeFileSync(DB_PATH, JSON.stringify(empty, null, 2));
    return empty;
  }
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

/* ── Users DB ── */
function loadUsers() {
  if (!fs.existsSync(USERS_PATH)) {
    const empty = { users: [], next_user_id: 1 };
    fs.writeFileSync(USERS_PATH, JSON.stringify(empty, null, 2));
    return empty;
  }
  try {
    return JSON.parse(fs.readFileSync(USERS_PATH, "utf8"));
  } catch {
    const empty = { users: [], next_user_id: 1 };
    fs.writeFileSync(USERS_PATH, JSON.stringify(empty, null, 2));
    return empty;
  }
}

function saveUsers(data) {
  fs.writeFileSync(USERS_PATH, JSON.stringify(data, null, 2));
}

/* ── Interests DB ── */
function loadInterests() {
  if (!fs.existsSync(INTEREST_PATH)) {
    const empty = { interests: [], next_id: 1 };
    fs.writeFileSync(INTEREST_PATH, JSON.stringify(empty, null, 2));
    return empty;
  }
  try {
    return JSON.parse(fs.readFileSync(INTEREST_PATH, "utf8"));
  } catch {
    const empty = { interests: [], next_id: 1 };
    fs.writeFileSync(INTEREST_PATH, JSON.stringify(empty, null, 2));
    return empty;
  }
}

function saveInterests(data) {
  fs.writeFileSync(INTEREST_PATH, JSON.stringify(data, null, 2));
}

/* ── Messages DB ── NEW */
function loadMessages() {
  if (!fs.existsSync(MESSAGES_PATH)) {
    const empty = {
      conversations: [],
      participants:  [],
      messages:      [],
      next_convo_id: 1,
      next_msg_id:   1,
    };
    fs.writeFileSync(MESSAGES_PATH, JSON.stringify(empty, null, 2));
    return empty;
  }
  try {
    return JSON.parse(fs.readFileSync(MESSAGES_PATH, "utf8"));
  } catch {
    const empty = {
      conversations: [],
      participants:  [],
      messages:      [],
      next_convo_id: 1,
      next_msg_id:   1,
    };
    fs.writeFileSync(MESSAGES_PATH, JSON.stringify(empty, null, 2));
    return empty;
  }
}

function saveMessages(data) {
  fs.writeFileSync(MESSAGES_PATH, JSON.stringify(data, null, 2));
}

/* ── WHERE clause helper ── */
function applyFilters(rows, sql, args) {
  let filtered = [...rows];
  let i = 0;

  if (sql.includes("AND source = ?")) {
    const val = args[i++];
    filtered = filtered.filter((r) => r.source === val);
  }

  if (sql.includes("AND (title LIKE ?")) {
    const term = (args[i++] || "").replace(/%/g, "").toLowerCase();
    i += 2;
    filtered = filtered.filter(
      (r) =>
        (r.title   || "").toLowerCase().includes(term) ||
        (r.summary || "").toLowerCase().includes(term) ||
        (r.agency  || "").toLowerCase().includes(term)
    );
  }

  if (sql.includes("AND agency LIKE ?")) {
    const term = (args[i++] || "").replace(/%/g, "").toLowerCase();
    filtered = filtered.filter(
      (r) => (r.agency || "").toLowerCase().includes(term)
    );
  }

  if (sql.includes("DATE(fetched_at) = DATE('now')")) {
    const today = new Date().toISOString().split("T")[0];
    filtered = filtered.filter(
      (r) => r.fetched_at && r.fetched_at.startsWith(today)
    );
  }

  return filtered;
}

const db = {

  /* ════════════════════════════
     User methods
  ════════════════════════════ */
  users: {
    findByUsername(username) {
      const data = loadUsers();
      return data.users.find(
        (u) => u.username.toLowerCase() === username.toLowerCase()
      ) || null;
    },

    findById(id) {
      const data = loadUsers();
      return data.users.find((u) => u.id === id) || null;
    },

    create(username, hashedPassword) {
      const data   = loadUsers();
      const exists = data.users.find(
        (u) => u.username.toLowerCase() === username.toLowerCase()
      );
      if (exists) throw new Error("Username already taken");

      const user = {
        id:           data.next_user_id++,
        username,
        password:     hashedPassword,
        role:         "user",
        created_at:   new Date().toISOString(),
        display_name: "",
        company:      "",
        job_title:    "",
        department:   "",
        email:        "",
        phone:        "",
        location:     "",
        bio:          "",
      };

      data.users.push(user);
      saveUsers(data);
      return user;
    },

    getAll() {
      const data = loadUsers();
      return data.users.map((u) => ({
        id:           u.id,
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

    getProfile(id) {
      const data = loadUsers();
      const user = data.users.find((u) => u.id === id);
      if (!user) return null;
      const { password, ...profile } = user;
      return profile;
    },

    getPublicProfile(id) {
      const data = loadUsers();
      const user = data.users.find((u) => u.id === id);
      if (!user) return null;
      return {
        id:           user.id,
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
    },

    updateProfile(id, fields) {
      const data = loadUsers();
      const user = data.users.find((u) => u.id === id);
      if (!user) throw new Error("User not found");

      const allowed = [
        "display_name", "company", "job_title",
        "department", "email", "phone", "location", "bio",
      ];

      allowed.forEach((field) => {
        if (fields[field] !== undefined) {
          user[field] = String(fields[field]).trim().slice(0, 200);
        }
      });

      user.updated_at = new Date().toISOString();
      saveUsers(data);
      return user;
    },

    updatePassword(id, hashedPassword) {
      const data = loadUsers();
      const user = data.users.find((u) => u.id === id);
      if (!user) throw new Error("User not found");
      user.password   = hashedPassword;
      user.updated_at = new Date().toISOString();
      saveUsers(data);
      return true;
    },

    delete(id) {
      const data   = loadUsers();
      const before = data.users.length;
      data.users   = data.users.filter((u) => u.id !== id);
      saveUsers(data);
      return data.users.length < before;
    },

    updateRole(id, role) {
      const data = loadUsers();
      const user = data.users.find((u) => u.id === id);
      if (!user) throw new Error("User not found");
      user.role = role;
      saveUsers(data);
      return user;
    },
  },

  /* ════════════════════════════
     Interest methods
  ════════════════════════════ */
  interests: {

    toggle(userId, opportunityId) {
      const data     = loadInterests();
      const oppIdStr = String(opportunityId);
      const existing = data.interests.findIndex(
        (i) => i.user_id === userId && i.opportunity_id === oppIdStr
      );

      if (existing >= 0) {
        data.interests.splice(existing, 1);
        saveInterests(data);
        return { interested: false };
      } else {
        data.interests.push({
          id:             data.next_id++,
          user_id:        userId,
          opportunity_id: oppIdStr,
          created_at:     new Date().toISOString(),
        });
        saveInterests(data);
        return { interested: true };
      }
    },

    isInterested(userId, opportunityId) {
      const data = loadInterests();
      return data.interests.some(
        (i) => i.user_id === userId && i.opportunity_id === String(opportunityId)
      );
    },

    getInterestedUsers(opportunityId) {
      const data    = loadInterests();
      const oppIdStr = String(opportunityId);
      const entries = data.interests.filter(
        (i) => i.opportunity_id === oppIdStr
      );

      return entries.map((entry) => {
        const profile = db.users.getPublicProfile(entry.user_id);
        return {
          ...profile,
          interested_at: entry.created_at,
        };
      }).filter(Boolean);
    },

    getByUser(userId) {
      const data = loadInterests();
      return data.interests
        .filter((i) => i.user_id === userId)
        .map((i) => i.opportunity_id);
    },

    getCounts(opportunityIds) {
      const data   = loadInterests();
      const counts = {};
      opportunityIds.forEach((id) => {
        const idStr  = String(id);
        counts[idStr] = data.interests.filter(
          (i) => i.opportunity_id === idStr
        ).length;
      });
      return counts;
    },
  },

  /* ════════════════════════════
     Messaging methods  ← NEW
  ════════════════════════════ */
  messaging: {

    // ── Conversations ──────────────────────────

    findDirectConversation(userIdA, userIdB) {
  const data = loadMessages();

  const userAConvos = data.participants
    .filter((p) => p.user_id === userIdA)  // ← no deleted_at filter
    .map((p) => p.conversation_id);

  const match = userAConvos.find((convId) => {
    const members   = data.participants.filter((p) => p.conversation_id === convId);
    const memberIds = members.map((m) => m.user_id);
    return (
      memberIds.length === 2 &&
      memberIds.includes(userIdA) &&
      memberIds.includes(userIdB)
    );
  });

  return match || null;
},

    getOrCreateConversation(userIdA, userIdB) {
  const data = loadMessages();

  // Check if conversation already exists (including soft deleted ones)
  const userAConvos = data.participants
    .filter((p) => p.user_id === userIdA)  // ← no deleted_at filter here
    .map((p) => p.conversation_id);

  const match = userAConvos.find((convId) => {
    const members    = data.participants.filter((p) => p.conversation_id === convId);
    const memberIds  = members.map((m) => m.user_id);
    return (
      memberIds.length === 2 &&
      memberIds.includes(userIdA) &&
      memberIds.includes(userIdB)
    );
  });

  if (match) {
  let restored = false;
  data.participants.forEach((p) => {
    // use == instead of === to handle string/number mismatch
    if (p.conversation_id == match && p.deleted_at) {
      delete p.deleted_at;
      restored = true;
    }
  });
  if (restored) saveMessages(data);
  return match;
}

  // Create new conversation
  const convId = data.next_convo_id++;
  data.conversations.push({
    id:         convId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  data.participants.push(
    {
      conversation_id: convId,
      user_id:         userIdA,
      joined_at:       new Date().toISOString(),
      last_read_at:    new Date().toISOString(),
    },
    {
      conversation_id: convId,
      user_id:         userIdB,
      joined_at:       new Date().toISOString(),
      last_read_at:    new Date().toISOString(),
    }
  );

  saveMessages(data);
  return convId;
},

    // Get all conversations for a user with last message + unread count
    getConversationsForUser(userId) {
      const data = loadMessages();

      // Find all conversation IDs this user is in
      const myParticipations = data.participants.filter(
    (p) => p.user_id === userId && !p.deleted_at  // ← ADD !p.deleted_at
    );

      return myParticipations
        .map((myPart) => {
          const convId = myPart.conversation_id;
          const conv   = data.conversations.find((c) => c.id === convId);
          if (!conv) return null;

          // Get other participants with their profiles
          const otherParticipants = data.participants
            .filter((p) => p.conversation_id === convId && p.user_id !== userId)
            .map((p) => db.users.getPublicProfile(p.user_id))
            .filter(Boolean);

          // Get last message
          const convMessages = data.messages
            .filter((m) => m.conversation_id === convId && !m.is_deleted)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));

          const lastMessage = convMessages[0] || null;

          // Count unread messages
          const lastRead  = new Date(myPart.last_read_at || 0);
          const unread    = convMessages.filter(
            (m) =>
              m.sender_id !== userId &&
              new Date(m.created_at) > lastRead
          ).length;

          return {
            id:               convId,
            created_at:       conv.created_at,
            updated_at:       conv.updated_at,
            other_users:      otherParticipants,
            last_message:     lastMessage,
            unread_count:     unread,
          };
        })
        .filter(Boolean)
        // Sort by most recent activity
        .sort((a, b) => {
          const aTime = a.last_message?.created_at || a.updated_at;
          const bTime = b.last_message?.created_at || b.updated_at;
          return bTime.localeCompare(aTime);
        });
    },

    // Check if a user is part of a conversation
    isParticipant(userId, conversationId) {
      const data = loadMessages();
      return data.participants.some(
        (p) => p.user_id === userId && p.conversation_id === conversationId
      );
    },

    // ── Messages ───────────────────────────────

    // Send a message
    sendMessage(conversationId, senderId, content) {
      const data = loadMessages();

      // Make sure sender is a participant
      const isParticipant = data.participants.some(
        (p) => p.conversation_id === conversationId && p.user_id === senderId
      );
      if (!isParticipant) throw new Error("Not a participant in this conversation");

      const msg = {
        id:              data.next_msg_id++,
        conversation_id: conversationId,
        sender_id:       senderId,
        content:         String(content).trim().slice(0, 5000),
        created_at:      new Date().toISOString(),
        edited_at:       null,
        is_deleted:      false,
      };

      data.messages.push(msg);

      // Update conversation updated_at
      const conv = data.conversations.find((c) => c.id === conversationId);
      if (conv) conv.updated_at = new Date().toISOString();

      saveMessages(data);

      // Return message with sender profile attached
      return {
        ...msg,
        sender: db.users.getPublicProfile(senderId),
      };
    },

    // Get messages for a conversation (paginated)
    getMessages(conversationId, limit = 50, offset = 0) {
      const data = loadMessages();

      const msgs = data.messages
        .filter((m) => m.conversation_id === conversationId && !m.is_deleted)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));

      const total  = msgs.length;
      const paged  = msgs.slice(offset, offset + limit);

      // Attach sender profiles
      const withSenders = paged.map((m) => ({
        ...m,
        sender: db.users.getPublicProfile(m.sender_id),
      }));

      return { messages: withSenders, total };
    },

    // Edit a message (only sender can edit)
    editMessage(messageId, userId, newContent) {
      const data = loadMessages();
      const msg  = data.messages.find((m) => m.id === messageId);

      if (!msg)                    throw new Error("Message not found");
      if (msg.sender_id !== userId) throw new Error("Cannot edit someone else's message");
      if (msg.is_deleted)           throw new Error("Cannot edit a deleted message");

      msg.content   = String(newContent).trim().slice(0, 5000);
      msg.edited_at = new Date().toISOString();

      saveMessages(data);
      return { ...msg, sender: db.users.getPublicProfile(msg.sender_id) };
    },

    // Soft delete a message (only sender can delete)
    deleteMessage(messageId, userId) {
      const data = loadMessages();
      const msg  = data.messages.find((m) => m.id === messageId);

      if (!msg)                    throw new Error("Message not found");
      if (msg.sender_id !== userId) throw new Error("Cannot delete someone else's message");

      msg.is_deleted = true;
            msg.deleted_at = new Date().toISOString();

      saveMessages(data);
      return { success: true };
    },

    // Mark all messages in a conversation as read for a user
    markAsRead(conversationId, userId) {
      const data        = loadMessages();
      const participant = data.participants.find(
        (p) => p.conversation_id === conversationId && p.user_id === userId
      );

      if (!participant) throw new Error("Not a participant in this conversation");

      participant.last_read_at = new Date().toISOString();
      saveMessages(data);
      return { success: true };
    },

    // Get total unread count across ALL conversations for a user
    getTotalUnread(userId) {
      const data           = loadMessages();
      const myParticipations = data.participants.filter(
        (p) => p.user_id === userId
      );

      let total = 0;
      myParticipations.forEach((myPart) => {
        const lastRead = new Date(myPart.last_read_at || 0);
        const unread   = data.messages.filter(
          (m) =>
            m.conversation_id === myPart.conversation_id &&
            m.sender_id       !== userId &&
            !m.is_deleted &&
            new Date(m.created_at) > lastRead
        ).length;
        total += unread;
      });

      return total;
    },

    // Soft delete — only hides conversation for the requesting user
    deleteConversation(conversationId, userId) {
      const data = loadMessages();

      const participant = data.participants.find(
        (p) => p.conversation_id === conversationId && p.user_id === userId
      );
      if (!participant) throw new Error("Not a participant in this conversation");

      // Just mark this participant as deleted — don't touch other participant
      participant.deleted_at = new Date().toISOString();

      saveMessages(data);
      return { success: true };
    },
  },

  /* ════════════════════════════
     Grants / feed methods
  ════════════════════════════ */
  prepare(sql) {
    return {
      run(...args) {
        const data = loadDB();

        if (sql.includes("INSERT INTO opportunities")) {
          const obj = args[0];
          const idx = data.opportunities.findIndex(
            (o) => o.source === obj.source && o.external_id === obj.external_id
          );
          if (idx >= 0) {
            const existingKeywords = new Set(
              (data.opportunities[idx].matched_keywords || "").split(", ").filter(Boolean)
            );
            const newKeywords = (obj.matched_keywords || "").split(", ").filter(Boolean);
            newKeywords.forEach((k) => existingKeywords.add(k));
            data.opportunities[idx] = {
              ...data.opportunities[idx],
              ...obj,
              id:               data.opportunities[idx].id,
              matched_keywords: [...existingKeywords].join(", "),
            };
          } else {
            data.opportunities.push({ id: data.next_id++, ...obj });
          }
          saveDB(data);
          return { changes: 1 };
        }

        if (sql.includes("INSERT INTO fetch_log")) {
          const isErrorInsert = sql.includes("error");
          if (isErrorInsert) {
            const [ran_at, source, status, error] = args;
            data.fetch_log.push({
              id: data.next_id++, ran_at, source, status, count: 0, error,
            });
          } else {
            const [ran_at, source, status, count] = args;
            data.fetch_log.push({
              id: data.next_id++, ran_at, source, status, count, error: null,
            });
          }
          saveDB(data);
          return { changes: 1 };
        }

        return { changes: 0 };
      },

      get(...args) {
        const data = loadDB();

        if (sql.includes("COUNT(*) as cnt")) {
          let rows = sql.includes("fetch_log")
            ? data.fetch_log
            : data.opportunities;
          rows = applyFilters(rows, sql, args);
          return { cnt: rows.length };
        }

        if (sql.includes("WHERE id = ?")) {
          return data.opportunities.find((o) => o.id === parseInt(args[0])) || null;
        }

        if (sql.includes("fetch_log ORDER BY ran_at DESC LIMIT 1")) {
          const sorted = [...data.fetch_log].sort((a, b) =>
            b.ran_at.localeCompare(a.ran_at)
          );
          return sorted[0] || null;
        }

        return null;
      },

      all(...args) {
        const data = loadDB();

        if (sql.includes("GROUP BY agency")) {
          const groups = {};
          data.opportunities.forEach((o) => {
            if (!o.agency) return;
            if (!groups[o.agency]) groups[o.agency] = { agency: o.agency, count: 0 };
            groups[o.agency].count++;
          });
          return Object.values(groups).sort((a, b) => b.count - a.count);
        }

        if (sql.includes("FROM opportunities") && !sql.includes("GROUP BY")) {
          let rows = applyFilters([...data.opportunities], sql, args);

          if (sql.includes("close_date DESC")) {
            rows.sort((a, b) =>
              (b.close_date || "").localeCompare(a.close_date || "")
            );
          } else {
            rows.sort((a, b) =>
              (b.fetched_at || "").localeCompare(a.fetched_at || "")
            );
          }

          const limit  = parseInt(args[args.length - 2]) || 20;
          const offset = parseInt(args[args.length - 1]) || 0;
          return rows.slice(offset, offset + limit);
        }

        if (sql.includes("GROUP BY source")) {
          const groups = {};
          data.opportunities.forEach((o) => {
            if (!groups[o.source]) {
              groups[o.source] = {
                source: o.source, count: 0, last_fetched: o.fetched_at || "",
              };
            }
            groups[o.source].count++;
            if ((o.fetched_at || "") > groups[o.source].last_fetched) {
              groups[o.source].last_fetched = o.fetched_at;
            }
          });
          return Object.values(groups);
        }

        if (sql.includes("FROM fetch_log")) {
          return [...data.fetch_log]
            .sort((a, b) => b.ran_at.localeCompare(a.ran_at))
            .slice(0, 50);
        }

        return [];
      },
    };
  },

  transaction(fn) { return (rows) => fn(rows); },
  exec() {},
};

module.exports = db;
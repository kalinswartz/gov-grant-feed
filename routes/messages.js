const express = require("express");
const router  = express.Router();
const db      = require("../db");

function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  next();
}

// GET /api/messages/conversations
router.get("/conversations", requireAuth, async (req, res) => {
  try {
    const conversations = await db.messaging.getConversationsForUser(
      req.session.userId
    );
    res.json({ conversations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/messages/unread
router.get("/unread", requireAuth, async (req, res) => {
  try {
    const count = await db.messaging.getTotalUnread(req.session.userId);
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/conversations
router.post("/conversations", requireAuth, async (req, res) => {
  try {
    const { target_user_id } = req.body;

    if (!target_user_id) {
      return res.status(400).json({ error: "target_user_id is required" });
    }

    if (String(target_user_id) === String(req.session.userId)) {
      return res.status(400).json({ error: "Cannot message yourself" });
    }

    const targetUser = await db.users.findById(target_user_id);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const conversationId = await db.messaging.getOrCreateConversation(
      req.session.userId,
      target_user_id
    );

    res.json({ conversation_id: conversationId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/messages/conversations/:id
router.get("/conversations/:id", requireAuth, async (req, res) => {
  try {
    const convId = req.params.id;
    const limit  = parseInt(req.query.limit)  || 50;
    const offset = parseInt(req.query.offset) || 0;

    const isParticipant = await db.messaging.isParticipant(
      req.session.userId,
      convId
    );
    if (!isParticipant) {
      return res.status(403).json({ error: "Access denied" });
    }

    const result = await db.messaging.getMessages(convId, limit, offset);
    await db.messaging.markAsRead(convId, req.session.userId);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/conversations/:id
router.post("/conversations/:id", requireAuth, async (req, res) => {
  try {
    const convId      = req.params.id;
    const { content } = req.body;

    if (!content?.trim()) {
      return res.status(400).json({ error: "Message content is required" });
    }

    if (content.trim().length > 5000) {
      return res.status(400).json({ error: "Message too long (max 5000 chars)" });
    }

    const isParticipant = await db.messaging.isParticipant(
      req.session.userId,
      convId
    );
    if (!isParticipant) {
      return res.status(403).json({ error: "Access denied" });
    }

    const message = await db.messaging.sendMessage(
      convId,
      req.session.userId,
      content
    );
    res.json({ message });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/messages/:messageId
router.patch("/:messageId", requireAuth, async (req, res) => {
  try {
    const msgId       = req.params.messageId;
    const { content } = req.body;

    if (!content?.trim()) {
      return res.status(400).json({ error: "Content is required" });
    }

    const message = await db.messaging.editMessage(
      msgId,
      req.session.userId,
      content
    );
    res.json({ message });
  } catch (err) {
    if (err.message.includes("Cannot edit")) {
      return res.status(403).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/messages/conversations/:id
router.delete("/conversations/:id", requireAuth, async (req, res) => {
  try {
    const convId = req.params.id;
    const result = await db.messaging.deleteConversation(
      convId,
      req.session.userId
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/conversations/:id/read
router.post("/conversations/:id/read", requireAuth, async (req, res) => {
  try {
    const convId        = req.params.id;
    const isParticipant = await db.messaging.isParticipant(
      req.session.userId,
      convId
    );
    if (!isParticipant) {
      return res.status(403).json({ error: "Access denied" });
    }

    const result = await db.messaging.markAsRead(convId, req.session.userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
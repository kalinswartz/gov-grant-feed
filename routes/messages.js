// routes/messages.js
const express = require("express");
const router  = express.Router();
const db      = require("../db");

// Middleware - make sure user is logged in
function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  next();
}

// ── GET /api/messages/conversations
// Get all conversations for logged in user
router.get("/conversations", requireAuth, (req, res) => {
  try {
    const conversations = db.messaging.getConversationsForUser(req.session.userId);
    res.json({ conversations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/messages/unread
// Get total unread count (for nav badge)
router.get("/unread", requireAuth, (req, res) => {
  try {
    const count = db.messaging.getTotalUnread(req.session.userId);
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/messages/conversations
// Start or get existing conversation with another user
router.post("/conversations", requireAuth, (req, res) => {
  try {
    const { target_user_id } = req.body;

    if (!target_user_id) {
      return res.status(400).json({ error: "target_user_id is required" });
    }

    if (target_user_id === req.session.userId) {
      return res.status(400).json({ error: "Cannot message yourself" });
    }

    // Make sure target user exists
    const targetUser = db.users.findById(target_user_id);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const conversationId = db.messaging.getOrCreateConversation(
      req.session.userId,
      target_user_id
    );

    res.json({ conversation_id: conversationId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/messages/conversations/:id
// Get messages in a conversation (paginated)
router.get("/conversations/:id", requireAuth, (req, res) => {
  try {
    const convId = parseInt(req.params.id);
    const limit  = parseInt(req.query.limit)  || 50;
    const offset = parseInt(req.query.offset) || 0;

    // Make sure user is in this conversation
    if (!db.messaging.isParticipant(req.session.userId, convId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const result = db.messaging.getMessages(convId, limit, offset);

    // Mark as read when fetching
    db.messaging.markAsRead(convId, req.session.userId);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/messages/conversations/:id
// Send a message
router.post("/conversations/:id", requireAuth, (req, res) => {
  try {
    const convId  = parseInt(req.params.id);
    const { content } = req.body;

    if (!content?.trim()) {
      return res.status(400).json({ error: "Message content is required" });
    }

    if (content.trim().length > 5000) {
      return res.status(400).json({ error: "Message too long (max 5000 chars)" });
    }

    // Make sure user is in this conversation
    if (!db.messaging.isParticipant(req.session.userId, convId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const message = db.messaging.sendMessage(convId, req.session.userId, content);
    res.json({ message });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/messages/:messageId
// Edit a message
router.patch("/:messageId", requireAuth, (req, res) => {
  try {
    const msgId      = parseInt(req.params.messageId);
    const { content } = req.body;

    if (!content?.trim()) {
      return res.status(400).json({ error: "Content is required" });
    }

    const message = db.messaging.editMessage(msgId, req.session.userId, content);
    res.json({ message });
  } catch (err) {
    if (err.message.includes("Cannot edit")) {
      return res.status(403).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/messages/:messageId
// Delete a message
router.delete("/:messageId", requireAuth, (req, res) => {
  try {
    const msgId = parseInt(req.params.messageId);
    const result = db.messaging.deleteMessage(msgId, req.session.userId);
    res.json(result);
  } catch (err) {
    if (err.message.includes("Cannot delete")) {
      return res.status(403).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/messages/conversations/:id
// Delete entire conversation
router.delete("/conversations/:id", requireAuth, (req, res) => {
  try {
    const convId = parseInt(req.params.id);
    const result = db.messaging.deleteConversation(convId, req.session.userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/messages/conversations/:id/read
// Manually mark conversation as read
router.post("/conversations/:id/read", requireAuth, (req, res) => {
  try {
    const convId = parseInt(req.params.id);

    if (!db.messaging.isParticipant(req.session.userId, convId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const result = db.messaging.markAsRead(convId, req.session.userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
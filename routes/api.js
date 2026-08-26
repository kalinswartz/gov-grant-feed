const express = require("express");
const router  = express.Router();
const db      = require("../db");

// GET /api/opportunities
router.get("/opportunities", async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const { total, rows } = await db.opportunities.find({
      source: req.query.source || null,
      search: req.query.search || null,
      agency: req.query.agency || null,
      sort:   req.query.sort   || "fetched_at",
      limit,
      offset,
    });

    const userId = req.session.userId;
    const ids    = rows.map((r) => r._id || r.id);
    const counts = await db.interests.getCounts(ids);
    const myList = userId ? await db.interests.getByUser(userId) : [];
    const mySet  = new Set(myList.map(String));

    const results = rows.map((r) => ({
      ...r,
      id:             String(r._id || r.id),
      interest_count:  counts[String(r._id || r.id)] || 0,
      user_interested: mySet.has(String(r._id || r.id)),
    }));

    res.json({ total, page, limit, pages: Math.ceil(total / limit), results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/opportunities/:id
router.get("/opportunities/:id", async (req, res) => {
  try {
    const row = await db.opportunities.findById(req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });

    const userId = req.session.userId;
    const id     = String(row._id || row.id);

    row.interest_count   = (await db.interests.getCounts([id]))[id] || 0;
    row.user_interested  = userId
      ? await db.interests.isInterested(userId, id)
      : false;
    row.interested_users = await db.interests.getInterestedUsers(id);

    res.json({ ...row, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agencies
router.get("/agencies", async (req, res) => {
  try {
    res.json(await db.opportunities.getAgencies());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/logs
router.get("/logs", async (req, res) => {
  try {
    res.json(await db.fetchLog.getAll());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/refresh
router.post("/refresh", async (req, res) => {
  try {
    const { runAllScrapers } = require("../scrapers");
    res.json({ message: "Refresh started. Check /api/logs for status." });
    await runAllScrapers();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats
router.get("/stats", async (req, res) => {
  try {
    const { total, newToday, bySource } = await db.opportunities.getStats();
    const lastRun = await db.fetchLog.getLast();
    res.json({
      total,
      newToday,
      bySource,
      lastRun: lastRun?.ran_at || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/opportunities/:id/interest
router.post("/opportunities/:id/interest", async (req, res) => {
  try {
    const oppId  = req.params.id;
    const userId = req.session.userId;

    const opp = await db.opportunities.findById(oppId);
    if (!opp) return res.status(404).json({ error: "Opportunity not found" });

    const result = await db.interests.toggle(userId, oppId);
    const count  = (await db.interests.getCounts([oppId]))[String(oppId)] || 0;

    res.json({ interested: result.interested, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/opportunities/:id/interest
router.get("/opportunities/:id/interest", async (req, res) => {
  try {
    const oppId = req.params.id;

    const opp = await db.opportunities.findById(oppId);
    if (!opp) return res.status(404).json({ error: "Opportunity not found" });

    const users = await db.interests.getInterestedUsers(oppId);
    res.json({
      opportunity_id:    oppId,
      opportunity_title: opp.title,
      count:             users.length,
      users,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/my-interests
router.get("/my-interests", async (req, res) => {
  try {
    const userId = req.session.userId;
    const oppIds = await db.interests.getByUser(userId);

    if (!oppIds.length) return res.json({ total: 0, results: [] });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const opps = await Promise.all(
      oppIds.map((id) => db.opportunities.findById(id))
    );

    const results = opps
      .filter(Boolean)
      .filter((r) => {
        if (!r.close_date) return true;
        const close = new Date(r.close_date);
        if (isNaN(close)) return true;
        close.setHours(23, 59, 59, 999);
        return close >= today;
      })
      .map((r) => ({
        ...r,
        id:             String(r._id || r.id),
        interest_count:  0,
        user_interested: true,
      }));

    res.json({ total: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users
router.get("/users", async (req, res) => {
  try {
    res.json({ users: await db.users.getAll() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
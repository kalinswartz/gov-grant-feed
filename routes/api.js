const express = require("express");
const router  = express.Router();
const db      = require("../db");

// GET /api/opportunities
router.get("/opportunities", (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const source = req.query.source || null;
    const search = req.query.search || null;
    const sort   = req.query.sort === "close_date" ? "close_date" : "fetched_at";
    const agency = req.query.agency || null;

    let where  = "WHERE 1=1";
    const params = [];

    if (source) { where += " AND source = ?";                                        params.push(source); }
    if (search) { where += " AND (title LIKE ? OR summary LIKE ? OR agency LIKE ?)"; const t = `%${search}%`; params.push(t, t, t); }
    if (agency) { where += " AND agency LIKE ?";                                     params.push(`%${agency}%`); }

    const total = db.prepare(`SELECT COUNT(*) as cnt FROM opportunities ${where}`).get(...params).cnt;
    const rows  = db.prepare(
      `SELECT * FROM opportunities ${where} ORDER BY ${sort} DESC NULLS LAST LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    // Attach interest counts and current user's interest status
    const userId = req.session.userId;
    const ids    = rows.map((r) => r.id);
    const counts = db.interests.getCounts(ids);
    const myList = userId ? db.interests.getByUser(userId) : [];
    const mySet  = new Set(myList.map(String));

    const results = rows.map((r) => ({
      ...r,
      interest_count:   counts[String(r.id)] || 0,
      user_interested:  mySet.has(String(r.id)),
    }));

    res.json({ total, page, limit, pages: Math.ceil(total / limit), results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/opportunities/:id
router.get("/opportunities/:id", (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM opportunities WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });

    const userId          = req.session.userId;
    row.interest_count    = db.interests.getCounts([row.id])[String(row.id)] || 0;
    row.user_interested   = userId ? db.interests.isInterested(userId, row.id) : false;
    row.interested_users  = db.interests.getInterestedUsers(row.id);

    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agencies
router.get("/agencies", (req, res) => {
  try {
    res.json(db.prepare(
      `SELECT agency, COUNT(*) as count FROM opportunities
       WHERE agency IS NOT NULL AND agency != ''
       GROUP BY agency ORDER BY count DESC`
    ).all());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sources
router.get("/sources", (req, res) => {
  try {
    res.json(db.prepare(
      `SELECT source, COUNT(*) as count, MAX(fetched_at) as last_fetched
       FROM opportunities GROUP BY source`
    ).all());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/logs
router.get("/logs", (req, res) => {
  try {
    res.json(db.prepare(`SELECT * FROM fetch_log ORDER BY ran_at DESC LIMIT 50`).all());
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
router.get("/stats", (req, res) => {
  try {
    const total    = db.prepare("SELECT COUNT(*) as cnt FROM opportunities").get().cnt;
    const bySource = db.prepare(`SELECT source, COUNT(*) as count FROM opportunities GROUP BY source`).all();
    const lastRun  = db.prepare("SELECT ran_at FROM fetch_log ORDER BY ran_at DESC LIMIT 1").get();
    const newToday = db.prepare(
      `SELECT COUNT(*) as cnt FROM opportunities WHERE DATE(fetched_at) = DATE('now')`
    ).get().cnt;
    res.json({ total, bySource, lastRun: lastRun?.ran_at || null, newToday });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════
// Interest endpoints
// ════════════════════════════

// POST /api/opportunities/:id/interest — toggle interest on/off
router.post("/opportunities/:id/interest", (req, res) => {
  try {
    const oppId  = req.params.id;
    const userId = req.session.userId;

    // Verify opportunity exists
    const opp = db.prepare("SELECT * FROM opportunities WHERE id = ?").get(oppId);
    if (!opp) return res.status(404).json({ error: "Opportunity not found" });

    const result = db.interests.toggle(userId, oppId);
    const count  = db.interests.getCounts([oppId])[String(oppId)] || 0;

    res.json({
      interested: result.interested,
      count,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/opportunities/:id/interest — get all interested users for an opportunity
router.get("/opportunities/:id/interest", (req, res) => {
  try {
    const oppId = req.params.id;

    const opp = db.prepare("SELECT * FROM opportunities WHERE id = ?").get(oppId);
    if (!opp) return res.status(404).json({ error: "Opportunity not found" });

    const users = db.interests.getInterestedUsers(oppId);
    const count = users.length;

    res.json({
      opportunity_id:   oppId,
      opportunity_title: opp.title,
      count,
      users,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/my-interests — all opportunities the current user is interested in
router.get("/my-interests", (req, res) => {
  try {
    const userId  = req.session.userId;
    const oppIds  = db.interests.getByUser(userId);

    if (!oppIds.length) return res.json({ total: 0, results: [] });

    // Fetch full opportunity data for each id
    const results = oppIds.map((id) => {
      const opp = db.prepare("SELECT * FROM opportunities WHERE id = ?").get(id);
      if (!opp) return null;
      return {
        ...opp,
        interest_count:  db.interests.getCounts([opp.id])[String(opp.id)] || 0,
        user_interested: true,
      };
    }).filter(Boolean);

    res.json({ total: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
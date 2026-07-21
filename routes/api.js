const express = require("express");
const router = express.Router();
const db = require("../db");

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

    let where = "WHERE 1=1";
    const params = [];

    if (source) {
      where += " AND source = ?";
      params.push(source);
    }

    if (search) {
      where += " AND (title LIKE ? OR summary LIKE ? OR agency LIKE ?)";
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (agency) {
      where += " AND agency LIKE ?";
      params.push(`%${agency}%`);
    }

    const total = db
      .prepare(`SELECT COUNT(*) as cnt FROM opportunities ${where}`)
      .get(...params).cnt;

    const rows = db
      .prepare(
        `SELECT * FROM opportunities ${where}
         ORDER BY ${sort} DESC NULLS LAST
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);

    res.json({
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      results: rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/opportunities/:id
router.get("/opportunities/:id", (req, res) => {
  try {
    const row = db
      .prepare("SELECT * FROM opportunities WHERE id = ?")
      .get(req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agencies — all distinct agencies with counts
router.get("/agencies", (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT agency, COUNT(*) as count
         FROM opportunities
         WHERE agency IS NOT NULL AND agency != ''
         GROUP BY agency
         ORDER BY count DESC`
      )
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sources
router.get("/sources", (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT source, COUNT(*) as count,
                MAX(fetched_at) as last_fetched
         FROM opportunities
         GROUP BY source`
      )
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/logs
router.get("/logs", (req, res) => {
  try {
    const rows = db
      .prepare(`SELECT * FROM fetch_log ORDER BY ran_at DESC LIMIT 50`)
      .all();
    res.json(rows);
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
    const total = db
      .prepare("SELECT COUNT(*) as cnt FROM opportunities")
      .get().cnt;

    const bySource = db
      .prepare(`SELECT source, COUNT(*) as count FROM opportunities GROUP BY source`)
      .all();

    const lastRun = db
      .prepare("SELECT ran_at FROM fetch_log ORDER BY ran_at DESC LIMIT 1")
      .get();

    const newToday = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM opportunities
         WHERE DATE(fetched_at) = DATE('now')`
      )
      .get().cnt;

    res.json({ total, bySource, lastRun: lastRun?.ran_at || null, newToday });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
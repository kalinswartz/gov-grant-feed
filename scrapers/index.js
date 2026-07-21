const db = require("../db");
const { fetchGrantsGov } = require("./grants_gov");

async function runAllScrapers() {
  const now = new Date().toISOString();
  console.log(`\n[${now}] Starting grant fetch run...`);

  const sources = [
    { name: "Grants.gov", fn: () => fetchGrantsGov() },
  ];

  const summary = [];

  for (const source of sources) {
    try {
      console.log(`  Fetching from ${source.name}...`);
      const items = await source.fn();
      const inserted = upsertItems(items, now);
      console.log(`  ✔ ${source.name}: ${items.length} fetched, ${inserted} new/updated`);

      db.prepare(
        `INSERT INTO fetch_log (ran_at, source, status, count) VALUES (?, ?, ?, ?)`
      ).run(now, source.name, "success", inserted);

      summary.push({ source: source.name, count: inserted, status: "ok" });
    } catch (err) {
      console.error(`  ✖ ${source.name} failed:`, err.message);

      db.prepare(
        `INSERT INTO fetch_log (ran_at, source, status, error) VALUES (?, ?, ?, ?)`
      ).run(now, source.name, "error", err.message);

      summary.push({ source: source.name, status: "error", error: err.message });
    }
  }

  console.log(`[${new Date().toISOString()}] Fetch run complete.\n`);
  return summary;
}

function upsertItems(items, fetchedAt) {
  const stmt = db.prepare(`
    INSERT INTO opportunities
      (source, external_id, title, summary, url, posted_date, close_date,
       agency, category, award_floor, award_ceil, matched_keywords, fetched_at)
    VALUES
      (@source, @external_id, @title, @summary, @url, @posted_date, @close_date,
       @agency, @category, @award_floor, @award_ceil, @matched_keywords, @fetched_at)
    ON CONFLICT(source, external_id) DO UPDATE SET
      title            = excluded.title,
      summary          = excluded.summary,
      url              = excluded.url,
      close_date       = excluded.close_date,
      agency           = excluded.agency,
      category         = excluded.category,
      award_floor      = excluded.award_floor,
      award_ceil       = excluded.award_ceil,
      matched_keywords = excluded.matched_keywords,
      fetched_at       = excluded.fetched_at
  `);

  let count = 0;
  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      const info = stmt.run({ ...row, fetched_at: fetchedAt });
      if (info.changes > 0) count++;
    }
  });

  insertMany(items);
  return count;
}

module.exports = { runAllScrapers };
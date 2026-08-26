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
      const items    = await source.fn();
      const inserted = await upsertItems(items);

      console.log(
        `  ✔ ${source.name}: ${items.length} fetched, ${inserted} new/updated`
      );

      await db.fetchLog.insert(now, source.name, "success", inserted);
      summary.push({ source: source.name, count: inserted, status: "ok" });

    } catch (err) {
      console.error(`  ✖ ${source.name} failed:`, err.message);
      await db.fetchLog.insert(now, source.name, "error", err.message);
      summary.push({ source: source.name, status: "error", error: err.message });
    }
  }

  console.log(`[${new Date().toISOString()}] Fetch run complete.\n`);
  return summary;
}

async function upsertItems(items) {
  let count = 0;
  for (const item of items) {
    try {
      await db.opportunities.upsert(item);
      count++;
    } catch (err) {
      console.error(`  [upsert] Failed for ${item.external_id}:`, err.message);
    }
  }
  return count;
}

module.exports = { runAllScrapers };
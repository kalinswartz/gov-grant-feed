const fs   = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "grants.json");

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

function applyFilters(rows, sql, args) {
  let filtered = [...rows];

  // Parse all args by what the SQL contains so order doesn't matter
  let argIndex = 0;

  // Source filter
  if (sql.includes("AND source = ?")) {
    const val = args[argIndex++];
    console.log(`[db filter] source = "${val}"`);
    filtered = filtered.filter((r) => r.source === val);
  }

  // Text search
  if (sql.includes("AND (title LIKE ?")) {
    const term = (args[argIndex++] || "").replace(/%/g, "").toLowerCase();
    argIndex += 2; // skip duplicate LIKE args
    console.log(`[db filter] search = "${term}"`);
    filtered = filtered.filter(
      (r) =>
        (r.title   || "").toLowerCase().includes(term) ||
        (r.summary || "").toLowerCase().includes(term) ||
        (r.agency  || "").toLowerCase().includes(term)
    );
  }

  // Agency filter
  if (sql.includes("AND agency LIKE ?")) {
    const term = (args[argIndex++] || "").replace(/%/g, "").toLowerCase();
    console.log(`[db filter] agency = "${term}" — rows before: ${filtered.length}`);
    filtered = filtered.filter(
      (r) => (r.agency || "").toLowerCase().includes(term)
    );
    console.log(`[db filter] agency rows after: ${filtered.length}`);
  }

  // New today filter
  if (sql.includes("DATE(fetched_at) = DATE('now')")) {
    const today = new Date().toISOString().split("T")[0];
    filtered = filtered.filter(
      (r) => r.fetched_at && r.fetched_at.startsWith(today)
    );
  }

  return filtered;
}

const db = {
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
              id: data.opportunities[idx].id,
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
            data.fetch_log.push({ id: data.next_id++, ran_at, source, status, count: 0, error });
          } else {
            const [ran_at, source, status, count] = args;
            data.fetch_log.push({ id: data.next_id++, ran_at, source, status, count, error: null });
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
          return (
            data.opportunities.find((o) => o.id === parseInt(args[0])) || null
          );
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

        // Distinct agencies with counts
        if (sql.includes("GROUP BY agency")) {
          const groups = {};
          data.opportunities.forEach((o) => {
            if (!o.agency) return;
            if (!groups[o.agency]) {
              groups[o.agency] = { agency: o.agency, count: 0 };
            }
            groups[o.agency].count++;
          });
          return Object.values(groups).sort((a, b) => b.count - a.count);
        }

        // Opportunities list
        if (
          sql.includes("FROM opportunities") &&
          !sql.includes("GROUP BY")
        ) {
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

        // GROUP BY source
        if (sql.includes("GROUP BY source")) {
          const groups = {};
          data.opportunities.forEach((o) => {
            if (!groups[o.source]) {
              groups[o.source] = {
                source:       o.source,
                count:        0,
                last_fetched: o.fetched_at || "",
              };
            }
            groups[o.source].count++;
            if ((o.fetched_at || "") > groups[o.source].last_fetched) {
              groups[o.source].last_fetched = o.fetched_at;
            }
          });
          return Object.values(groups);
        }

        // fetch_log
        if (sql.includes("FROM fetch_log")) {
          return [...data.fetch_log]
            .sort((a, b) => b.ran_at.localeCompare(a.ran_at))
            .slice(0, 50);
        }

        return [];
      },
    };
  },

  transaction(fn) {
    return (rows) => fn(rows);
  },

  exec() {},
};

module.exports = db;
const fs   = require("fs");
const path = require("path");

const DB_PATH       = path.join(__dirname, "grants.json");
const USERS_PATH    = path.join(__dirname, "users.json");
const INTEREST_PATH = path.join(__dirname, "interests.json");

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

    // Toggle interest — returns { interested: true/false }
    toggle(userId, opportunityId) {
      const data     = loadInterests();
      const oppIdStr = String(opportunityId);
      const existing = data.interests.findIndex(
        (i) => i.user_id === userId && i.opportunity_id === oppIdStr
      );

      if (existing >= 0) {
        // Remove interest
        data.interests.splice(existing, 1);
        saveInterests(data);
        return { interested: false };
      } else {
        // Add interest
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

    // Is a specific user interested in a specific opportunity?
    isInterested(userId, opportunityId) {
      const data = loadInterests();
      return data.interests.some(
        (i) => i.user_id === userId && i.opportunity_id === String(opportunityId)
      );
    },

    // Get all users interested in an opportunity (with public profiles)
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

    // Get all opportunities a user is interested in (returns opportunity ids)
    getByUser(userId) {
      const data = loadInterests();
      return data.interests
        .filter((i) => i.user_id === userId)
        .map((i) => i.opportunity_id);
    },

    // Get interest counts for a list of opportunity ids
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
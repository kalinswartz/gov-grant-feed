require("dotenv").config();
const express        = require("express");
const cors           = require("cors");
const cron           = require("node-cron");
const path           = require("path");
const session        = require("express-session");
const FileStore      = require("session-file-store")(session);

const app            = express();
const PORT           = process.env.PORT           || 3000;
const CRON_SCHEDULE  = process.env.CRON_SCHEDULE  || "0 0 * * *";
const SESSION_SECRET = process.env.SESSION_SECRET || "change_me_please";

/* ── Middleware ── */
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());

/* ── Sessions — stored as JSON files in ./sessions/ folder ── */
app.use(session({
  store: new FileStore({
    path:        "./sessions",
    ttl:         7 * 24 * 60 * 60, // 7 days in seconds
    retries:     1,
    logFn:       function() {},     // silence verbose logs
  }),
  secret:            SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days in ms
    httpOnly: true,
    sameSite: "lax",
  },
}));

/* ── Auth routes (public) ── */
const { router: authRouter, requireAuth } = require("./routes/auth");
app.use("/auth", authRouter);

const messagesRouter = require("./routes/messages");
app.use("/api/messages", messagesRouter);

/* ── Protected API routes ── */
app.use("/api", requireAuth, require("./routes/api"));

/* ── Static files ── */
app.use(express.static(path.join(__dirname, "public")));

/* ── All other routes → index.html ── */
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ── Cron ── */
const { runAllScrapers } = require("./scrapers");

cron.schedule(CRON_SCHEDULE, async () => {
  console.log(`[CRON] Running scheduled scrape: ${new Date().toISOString()}`);
  await runAllScrapers();
});

console.log(`[CRON] Scheduled: "${CRON_SCHEDULE}"`);

/* ── Initial scrape on startup ── */
(async () => {
  console.log("[STARTUP] Running initial scrape...");
  await runAllScrapers();
})();

app.listen(PORT, () => {
  console.log(`\n✅ Server running at http://localhost:${PORT}\n`);
});
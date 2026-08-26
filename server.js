require("dotenv").config();
const express        = require("express");
const cors           = require("cors");
const cron           = require("node-cron");
const path           = require("path");
const session        = require("express-session");
const { MongoClient, ServerApiVersion } = require("mongodb");
const MongoStore     = require("connect-mongo").MongoStore;
const { connectDB }  = require("./lib/mongoose");

const app            = express();
const PORT           = process.env.PORT          || 3000;
const CRON_SCHEDULE  = process.env.CRON_SCHEDULE || "0 0 * * *";
const SESSION_SECRET = process.env.SESSION_SECRET || "change_me_please";

/* ── Connect to MongoDB ── */
connectDB();

/* ── Middleware ── */
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());

/* ── Sessions stored in MongoDB ── */
app.use(session({
  store: MongoStore.create({
    mongoUrl:   process.env.MONGODB_URI,
    dbName:     "fundingopportunities",
    ttl:        7 * 24 * 60 * 60,
    autoRemove: "native",
    mongoClientOptions: {
      serverApi: {
        version:          ServerApiVersion.v1,
        strict:           true,
        deprecationErrors: true,
      }
    }
  }),
  secret:            SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    maxAge:   7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "lax",
    secure:   process.env.NODE_ENV === "production",
  },
}));

/* ── Health check ── */
app.get("/health", (req, res) => res.json({ status: "ok" }));

/* ── Auth routes ── */
const { router: authRouter, requireAuth } = require("./routes/auth");
app.use("/auth", authRouter);

/* ── Messages routes ── */
const messagesRouter = require("./routes/messages");
app.use("/api/messages", messagesRouter);

/* ── Resume routes ── */
const resumeRouter = require("./routes/resume");
app.use("/api/resume", requireAuth, resumeRouter);

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
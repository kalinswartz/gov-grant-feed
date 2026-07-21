require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "0 0 * * *";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// API routes
app.use("/api", require("./routes/api"));

// Serve the frontend for all other routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Schedule the scraper
const { runAllScrapers } = require("./scrapers");

cron.schedule(CRON_SCHEDULE, async () => {
  console.log(`[CRON] Running scheduled scrape: ${new Date().toISOString()}`);
  await runAllScrapers();
});

console.log(`[CRON] Scheduled with pattern: "${CRON_SCHEDULE}"`);

// Run once on startup so the feed isn't empty
(async () => {
  console.log("[STARTUP] Running initial scrape...");
  await runAllScrapers();
})();

app.listen(PORT, () => {
  console.log(`\n✅ Server running at http://localhost:${PORT}\n`);
});
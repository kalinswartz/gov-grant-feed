const express    = require("express");
const router     = express.Router();
const multer     = require("multer");
const PDFParser  = require("pdf2json");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const rateLimit = {}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are supported"));
    }
  },
});

// Extract text from PDF buffer using pdf2json
function extractTextFromPDF(buffer) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1);

    pdfParser.on("pdfParser_dataError", (err) => {
      reject(new Error("Failed to parse PDF: " + err.parserError));
    });

    pdfParser.on("pdfParser_dataReady", () => {
      try {
        const text = pdfParser.getRawTextContent();
        resolve(text);
      } catch(e) {
        reject(new Error("Failed to extract text from PDF"));
      }
    });

    pdfParser.parseBuffer(buffer);
  });
}

function isRealPDF(buffer) {
  // PDF files always start with %PDF-
  return buffer.slice(0, 5).toString("ascii") === "%PDF-";
}

// POST /api/resume/parse
router.post("/parse", upload.single("resume"), async (req, res) => {
    // Rate limit — max 5 parses per user per hour
  const userId  = req.session.userId;
  const now     = Date.now();
  const hourAgo = now - 60 * 60 * 1000;

  if (!rateLimit[userId]) rateLimit[userId] = [];

  // Remove entries older than 1 hour
  rateLimit[userId] = rateLimit[userId].filter((t) => t > hourAgo);

  if (rateLimit[userId].length >= 5) {
    return res.status(429).json({
      error: "Too many requests — max 5 resume parses per hour"
    });
  }

  rateLimit[userId].push(now);

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Check if the uploaded file is a real PDF
    if (!isRealPDF(req.file.buffer)) {
      return res.status(400).json({ error: "Invalid PDF file" });
    }

    // Extract text from PDF
    let text;
    try {
      text = await extractTextFromPDF(req.file.buffer);
    } catch(e) {
      return res.status(400).json({ error: e.message });
    }

    if (!text || text.trim().length < 50) {
      return res.status(400).json({ error: "Could not extract text from PDF — try a text-based PDF rather than a scanned image" });
    }

    // Trim to avoid token limits
    const trimmedText = text.slice(0, 8000);

    // Send to Gemini
    const model  = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
    const prompt = `
      Extract the following information from this resume text and return ONLY
      a valid JSON object with these exact keys. If a field cannot be found,
      use an empty string "".

      Keys to extract:
      - display_name   (full name)
      - job_title      (most recent or current job title)
      - company        (most recent or current employer/organization)
      - department     (department if mentioned)
      - email          (email address)
      - phone          (phone number)
      - location       (city and state, e.g. "College Station, TX")
      - bio            (write a 2-3 sentence professional summary based on their experience, max 300 chars)

      Resume text:
      ---
      ${trimmedText}
      ---

      Return ONLY the JSON object, no markdown, no explanation, no code blocks.
    `;

    const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
        temperature: 0.1,  // low temp = more consistent extraction
    },
    // This tells Google not to use this request for training
    safetySettings: [],
    });
    const response = await result.response;
    const rawText  = response.text().trim();

    // Parse the JSON response
    let parsed;
    try {
      const cleaned = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("[Resume] Failed to parse Gemini response:", rawText);
      return res.status(500).json({ error: "AI returned invalid response, please try again" });
    }

    // Sanitize
    const allowed = ["display_name", "job_title", "company", "department",
                     "email", "phone", "location", "bio"];
    const safe = {};
    allowed.forEach((key) => {
      safe[key] = String(parsed[key] || "").trim().slice(0, 200);
    });
    safe.bio = String(parsed.bio || "").trim().slice(0, 500);

    res.json({ profile: safe });

  } catch (err) {
    console.error("[Resume] Error:", err.message);
  if (err.message.includes("Only PDF")) {
    return res.status(400).json({ error: err.message });
  }
  if (err.message.includes("too large")) {
    return res.status(400).json({ error: err.message });
  }
  // Generic message to client, full error only in server logs
  res.status(500).json({ error: "Failed to parse resume — please try again" });
  }
});

module.exports = router;
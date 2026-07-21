const axios = require("axios");

const SEARCH2_URL = "https://api.grants.gov/v1/api/search2";

const KEYWORDS = [
  "transportation research",
  "highway research",
  "roadway safety",
  "traffic safety",
  "transportation infrastructure",
  "transportation planning",
  "freight transportation",
  "commercial vehicle",
  "motor carrier safety",
  "FMCSA",
  "transit safety",
  "rail safety",
  "aviation safety",
  "port transportation",
  "multimodal transportation",
  "connected vehicles",
  "autonomous vehicles",
  "vehicle automation",
  "intelligent transportation systems",
  "ITS",
  "traffic operations",
  "work zone safety",
  "pedestrian safety",
  "bicycle safety",
  "pavement research",
  "bridge safety",
  "transportation security",
  "emergency transportation",
  "transportation data",
  "transportation modeling",
  "FHWA",
  "Federal Highway Administration",
  "NHTSA",
  "National Highway Traffic Safety",
  "TxDOT",
  "FTA",
  "Federal Transit Administration",
  "USDOT",
  "Bureau of Transportation Statistics",
  "transportation equity",
  "rural transportation",
  "urban mobility",
];

// ── Blocked agency codes — clearly non-transportation ──
const BLOCKED_AGENCY_CODES = new Set([
  "HHS",        // Health & Human Services
  "NIH",        // National Institutes of Health
  "CDC",        // Centers for Disease Control
  "HRSA",       // Health Resources & Services Admin
  "SAMHSA",     // Substance Abuse & Mental Health
  "CMS",        // Centers for Medicare & Medicaid
  "ACF",        // Administration for Children & Families
  "AoA",        // Administration on Aging
  "FDA",        // Food & Drug Administration
  "AHRQ",       // Agency for Healthcare Research
  "IHS",        // Indian Health Service
  "USDA",       // Agriculture
  "ED",         // Education
  "DOE",        // Energy (not transport)
  "EPA",        // Environmental Protection
  "HUD",        // Housing & Urban Development
  "DOL",        // Labor
  "DOJ",        // Justice
  "DOS",        // State
  "DOI",        // Interior
  "TREAS",      // Treasury
  "SBA",        // Small Business Admin
  "NSF",        // National Science Foundation (unless transport)
  "NASA",       // Space
  "VA",         // Veterans Affairs
  "SSA",        // Social Security
  "DHS",        // Homeland Security (unless transport security)
  "NEA",        // National Endowment for the Arts
  "NEH",        // National Endowment for the Humanities
  "IMLS",       // Institute of Museum and Library Services
  "CNCS",       // Corporation for National & Community Service
  "EDA",        // Economic Development Administration
  "MBDA",       // Minority Business Development
  "USAID",      // International Development
  "USAGM",      // Global Media
  "NRC",        // Nuclear Regulatory Commission
  "OPM",        // Office of Personnel Management
  "GSA",        // General Services (unless transport)
  "NARA",       // National Archives
  "LOC",        // Library of Congress
]);

// ── Transportation-related agency codes — always allow ──
const TRANSPORT_AGENCY_CODES = new Set([
  "DOT",
  "DOT-FMCSA",
  "DOT-FHWA",
  "DOT-FTA",
  "DOT-NHTSA",
  "DOT-FRA",
  "DOT-FAA",
  "DOT-PHMSA",
  "DOT-MARAD",
  "DOT-OST",
  "DOT-BTS",
  "DOT-SLSDC",
  "DOT-RITA",
]);

// ── Keywords that indicate transport relevance in title ──
const TRANSPORT_TITLE_KEYWORDS = [
  "transport",
  "highway",
  "road",
  "traffic",
  "vehicle",
  "transit",
  "rail",
  "aviation",
  "airport",
  "freight",
  "trucking",
  "motor carrier",
  "pedestrian",
  "bicycle",
  "pavement",
  "bridge",
  "corridor",
  "intersection",
  "signal",
  "mobility",
  "commut",
  "bus",
  "ferry",
  "port",
  "maritime",
  "pipeline",
  "autonomous",
  "connected vehicle",
  "ITS",
  "FMCSA",
  "FHWA",
  "NHTSA",
  "FTA",
  "FRA",
  "FAA",
  "DOT",
  "USDOT",
  "TxDOT",
];

async function fetchWithRetry(payload, label, maxRetries = 4) {
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const { data } = await axios.post(SEARCH2_URL, payload, {
        headers: {
          "Content-Type": "application/json",
          "Accept":        "application/json",
        },
        timeout: 20000,
      });

      if (data?.errorcode !== 0) {
        console.warn(`  [Grants.gov] API error for "${label}": ${data?.msg}`);
        return [];
      }

      return data?.data?.oppHits || [];
    } catch (err) {
      const status = err.response?.status;

      if ((status === 429 || status === 403) && attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt + 1) * 1500;
        console.warn(
          `  [Grants.gov] ${status} on "${label}" — retrying in ${
            waitMs / 1000
          }s (attempt ${attempt + 1}/${maxRetries})`
        );
        await sleep(waitMs);
        attempt++;
        continue;
      }

      console.error(`  [Grants.gov] Failed "${label}": ${err.message}`);
      return [];
    }
  }

  return [];
}

async function fetchGrantsGov() {
  const resultMap = new Map();
  let skipped = 0;

  console.log(`  [Grants.gov] Searching ${KEYWORDS.length} keywords...`);

  for (let i = 0; i < KEYWORDS.length; i++) {
    const keyword = KEYWORDS[i];

    const payload = {
      rows:              25,
      keyword,
      oppNum:            "",
      eligibilities:     "",
      agencies:          "",
      oppStatuses:       "forecasted|posted",
      aln:               "",
      fundingCategories: "",
    };

    const hits = await fetchWithRetry(payload, keyword);

    for (const opp of hits) {
      const id = opp.id?.toString();
      if (!id) continue;

      // ── Filter check ──
      if (!isTransportationRelated(opp)) {
        skipped++;
        continue;
      }

      if (resultMap.has(id)) {
        addKeyword(resultMap.get(id), keyword);
      } else {
        resultMap.set(id, {
          source:           "Grants.gov",
          external_id:      id,
          title:            opp.title       || "Untitled",
          summary:          buildSummary(opp),
          url:              `https://simpler.grants.gov/opportunity/${id}`,
          posted_date:      opp.openDate    || null,
          close_date:       opp.closeDate   || null,
          agency:           buildAgencyLabel(opp),
          category:         opp.oppStatus   || null,
          award_floor:      null,
          award_ceil:       null,
          matched_keywords: keyword,
        });
      }
    }

    const delay = (i + 1) % 10 === 0 ? 5000 : 1500;
    await sleep(delay);
  }

  console.log(
    `  [Grants.gov] Done — ${resultMap.size} kept, ${skipped} non-transport skipped.`
  );
  return [...resultMap.values()];
}

/* ── Transportation relevance filter ── */
function isTransportationRelated(opp) {
  const agencyCode = (opp.agencyCode || "").toUpperCase().trim();
  const agencyName = (opp.agencyName || "").toLowerCase();
  const title      = (opp.title      || "").toLowerCase();

  // 1. Always allow known transport agency codes
  if (TRANSPORT_AGENCY_CODES.has(agencyCode)) return true;

  // 2. Always block known non-transport agency codes
  // Check if the agencyCode starts with any blocked code
  for (const blocked of BLOCKED_AGENCY_CODES) {
    if (agencyCode === blocked || agencyCode.startsWith(blocked + "-")) {
      return false;
    }
  }

  // 3. Check agency name for transport keywords
  const transportAgencyNames = [
    "transportation",
    "highway",
    "transit",
    "motor carrier",
    "federal aviation",
    "federal railroad",
    "maritime",
    "pipeline",
    "nhtsa",
    "fmcsa",
    "fhwa",
    "fta",
    "fra",
    "faa",
  ];

  for (const name of transportAgencyNames) {
    if (agencyName.includes(name)) return true;
  }

  // 4. Check title for transport keywords
  for (const kw of TRANSPORT_TITLE_KEYWORDS) {
    if (title.includes(kw.toLowerCase())) return true;
  }

  // 5. Check ALN numbers — 20.xxx = DOT programs
  if (Array.isArray(opp.alnList)) {
    for (const aln of opp.alnList) {
      if (String(aln).startsWith("20.")) return true;
    }
  }

  // 6. If none of the above matched, exclude it
  return false;
}

/* ── Helpers ── */
function buildAgencyLabel(opp) {
  const code = opp.agencyCode || "";
  const name = opp.agencyName || "";
  if (code && name) return `${code} · ${name}`;
  return name || code || "Unknown Agency";
}

function buildSummary(opp) {
  const parts = [];
  if (opp.agencyCode)      parts.push(`Agency Code: ${opp.agencyCode}`);
  if (opp.agencyName)      parts.push(`Agency: ${opp.agencyName}`);
  if (opp.oppStatus)       parts.push(`Status: ${opp.oppStatus}`);
  if (opp.docType)         parts.push(`Type: ${opp.docType}`);
  if (opp.alnList?.length) parts.push(`ALN: ${opp.alnList.join(", ")}`);
  if (opp.closeDate)       parts.push(`Closes: ${opp.closeDate}`);
  return parts.join(" | ") || "See link for details.";
}

function addKeyword(result, keyword) {
  const keywords = new Set(
    result.matched_keywords.split(", ").filter(Boolean)
  );
  keywords.add(keyword);
  result.matched_keywords = [...keywords].join(", ");
}

function buildInitialTags(opp, keyword) {
  const tags = new Set();
  tags.add(keyword);
  if (opp.agencyCode) tags.add(opp.agencyCode);
  return [...tags].join(", ");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { fetchGrantsGov };
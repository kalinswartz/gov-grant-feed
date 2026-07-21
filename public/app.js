/* ── State ── */
var currentPage = 1;
var totalPages  = 1;
var searchTimer = null;
var agencyList  = [];

/* ── Init ── */
document.addEventListener("DOMContentLoaded", function() {
  loadStats();
  loadAgencies().then(function() { loadFeed(1); });
  setInterval(loadStats, 60000);
});

/* ── Stats ── */
async function loadStats() {
  try {
    var data = await apiFetch("/api/stats");
    document.getElementById("stat-total").textContent  = data.total.toLocaleString();
    document.getElementById("stat-today").textContent  = data.newToday.toLocaleString();
    var bySource = {};
    (data.bySource || []).forEach(function(s) { bySource[s.source] = s.count; });
    document.getElementById("stat-grants").textContent =
      (bySource["Grants.gov"] || 0).toLocaleString();
    if (data.lastRun) {
      document.getElementById("last-updated").textContent =
        "Last run: " + formatRelativeTime(data.lastRun);
    }
  } catch (err) {
    console.error("Stats error:", err);
  }
}

/* ── Agency Dropdown ── */
async function loadAgencies() {
  try {
    agencyList = await apiFetch("/api/agencies");
    var select = document.getElementById("agency-filter");

    while (select.options.length > 1) select.remove(1);

    agencyList.forEach(function(a) {
      if (!a.agency) return;
      var opt         = document.createElement("option");
      opt.value       = a.agency;
      opt.textContent = a.agency + " (" + a.count + ")";
      select.appendChild(opt);
    });

    console.log("[loadAgencies] loaded " + agencyList.length + " agencies");
  } catch (err) {
    console.error("[loadAgencies] error:", err);
  }
}

function onAgencyDropdownChange() {
  var val = document.getElementById("agency-filter").value;
  document.getElementById("agency-filter").classList.toggle("filter-active", !!val);
  loadFeed(1);
}

/* ── Feed ── */
async function loadFeed(page) {
  page        = page || 1;
  currentPage = page;

  var search = document.getElementById("search-input").value.trim();
  var agency = document.getElementById("agency-filter").value;
  var sort   = document.getElementById("sort-select").value;
  var limit  = document.getElementById("limit-select").value;

  var params = new URLSearchParams({
    page:  page,
    limit: limit,
    sort:  sort
  });
  if (search) params.set("search", search);
  if (agency) params.set("agency", agency);

  document.getElementById("search-input").classList.toggle("filter-active", !!search);
  document.getElementById("agency-filter").classList.toggle("filter-active", !!agency);

  var feed = document.getElementById("feed");
  feed.innerHTML =
    '<div class="loading"><div class="spinner"></div>' +
    "<span>Fetching opportunities...</span></div>";

  try {
    var data = await apiFetch("/api/opportunities?" + params.toString());
    totalPages = data.pages || 1;

    if (!data.results || data.results.length === 0) {
      feed.innerHTML =
        '<div class="empty">🔍 No opportunities found.<br>' +
        '<small style="margin-top:8px;display:block">' +
        "Try a different filter or click <strong>Clear</strong>.</small></div>";
      renderPagination(0, 0);
      return;
    }

    feed.innerHTML = "";
    data.results.forEach(function(item) {
      feed.appendChild(buildCard(item));
    });
    renderPagination(data.page, data.pages);
  } catch (err) {
    console.error("[loadFeed] error:", err);
    feed.innerHTML =
      '<div class="empty" style="color:var(--red)">⚠️ Failed to load feed.<br>' +
      "<small>" + escHtml(err.message) + "</small></div>";
  }
}

/* ── Clear Filters ── */
function clearFilters() {
  document.getElementById("search-input").value  = "";
  document.getElementById("agency-filter").value = "";
  document.getElementById("sort-select").value   = "fetched_at";
  document.getElementById("search-input").classList.remove("filter-active");
  document.getElementById("agency-filter").classList.remove("filter-active");
  loadFeed(1);
  showToast("Filters cleared", "");
}

/* ── Set agency filter (used by card chip clicks) ── */
function setAgencyFilter(agencyValue) {
  console.log("[setAgencyFilter] looking for:", agencyValue);

  var select  = document.getElementById("agency-filter");
  var matched = false;

  /* 1. Exact match */
  for (var i = 0; i < select.options.length; i++) {
    if (select.options[i].value === agencyValue) {
      select.value = agencyValue;
      matched = true;
      console.log("[setAgencyFilter] exact match at index", i);
      break;
    }
  }

  /* 2. Partial match */
  if (!matched) {
    var lower = agencyValue.toLowerCase();
    for (var j = 0; j < select.options.length; j++) {
      if (select.options[j].value.toLowerCase().indexOf(lower) !== -1) {
        select.value = select.options[j].value;
        matched = true;
        console.log("[setAgencyFilter] partial match:", select.options[j].value);
        break;
      }
    }
  }

  if (matched) {
    select.classList.add("filter-active");
    showToast("🏢 Filtering: " + agencyValue, "success");
    loadFeed(1);
    scrollToTop();
  } else {
    /* Fallback: use the search box */
    console.warn("[setAgencyFilter] no dropdown match, using search box");
    document.getElementById("search-input").value = agencyValue;
    document.getElementById("search-input").classList.add("filter-active");
    showToast("🔍 Searching: " + agencyValue, "success");
    loadFeed(1);
    scrollToTop();
  }
}

/* ── Card Builder ── */
function buildCard(item) {
  var card       = document.createElement("div");
  card.className = "grant-card";

  /* ── header ── */
  var header     = document.createElement("div");
  header.className = "card-header";

  var title      = document.createElement("div");
  title.className = "card-title";
  title.textContent = item.title || "Untitled";

  var badge      = document.createElement("span");
  badge.className = "source-badge";
  badge.textContent = "Grants.gov";

  header.appendChild(title);
  header.appendChild(badge);

  /* ── summary ── */
  var summary    = document.createElement("div");
  summary.className = "card-summary";
  summary.textContent = truncate(item.summary || "", 280);

  /* ── meta ── */
  var meta       = document.createElement("div");
  meta.className = "card-meta";
  buildMetaChips(item, meta);   // append chips directly into meta

  /* ── link ── */
  var link       = document.createElement("a");
  link.className = "card-link";
  link.href      = item.url || "#";
  link.target    = "_blank";
  link.rel       = "noopener noreferrer";
  link.textContent = "View →";
  meta.appendChild(link);

  card.appendChild(header);
  card.appendChild(summary);
  card.appendChild(meta);

  return card;
}

/* ── Meta Chips — append into a container element ── */
/* Using DOM methods (not innerHTML) so event listeners work reliably */
function buildMetaChips(item, container) {

  /* Agency chip */
  if (item.agency) {
    var chip = document.createElement("span");
    chip.className   = "meta-chip agency-chip";
    chip.title       = "Click to filter by this agency";
    chip.textContent = "🏢 " + truncate(item.agency, 60);

    /* Store the value on the element — no inline onclick needed */
    chip.dataset.agency = item.agency;
    chip.addEventListener("click", function() {
      setAgencyFilter(this.dataset.agency);
    });

    container.appendChild(chip);
  }

  /* Status / category chip */
  if (item.category) {
    var cat = document.createElement("span");
    cat.className   = "meta-chip";
    cat.textContent = "🏷️ " + item.category;
    container.appendChild(cat);
  }

  /* Posted date */
  if (item.posted_date) {
    var posted = document.createElement("span");
    posted.className   = "meta-chip";
    posted.textContent = "📅 Posted: " + item.posted_date;
    container.appendChild(posted);
  }

  /* Close date */
  if (item.close_date) {
    var cl = document.createElement("span");
    cl.className   = "meta-chip deadline";
    cl.textContent = "⏰ Closes: " + item.close_date +
                     (isClosingSoon(item.close_date) ? " ⚠️" : "");
    container.appendChild(cl);
  }

  /* Award ceiling */
  if (item.award_ceil) {
    var ceil = document.createElement("span");
    ceil.className   = "meta-chip award";
    ceil.textContent = "💰 Up to $" + Number(item.award_ceil).toLocaleString();
    container.appendChild(ceil);
  }

  /* Award floor */
  if (item.award_floor && item.award_floor !== item.award_ceil) {
    var floor = document.createElement("span");
    floor.className   = "meta-chip award";
    floor.textContent = "💵 Min $" + Number(item.award_floor).toLocaleString();
    container.appendChild(floor);
  }
}

/* ── Pagination ── */
function renderPagination(page, pages) {
  var pag = document.getElementById("pagination");
  pag.innerHTML = "";
  if (pages <= 1) return;

  var prev         = document.createElement("button");
  prev.className   = "page-btn";
  prev.textContent = "‹";
  prev.disabled    = (page <= 1);
  prev.addEventListener("click", function() { loadFeed(page - 1); scrollToTop(); });
  pag.appendChild(prev);

  var range = getPageRange(page, pages);
  range.forEach(function(p) {
    if (p === "...") {
      var dots         = document.createElement("span");
      dots.className   = "page-info";
      dots.textContent = "…";
      pag.appendChild(dots);
    } else {
      var btn          = document.createElement("button");
      btn.className    = "page-btn" + (p === page ? " active" : "");
      btn.textContent  = p;
      btn.addEventListener("click", (function(pg) {
        return function() { loadFeed(pg); scrollToTop(); };
      })(p));
      pag.appendChild(btn);
    }
  });

  var next         = document.createElement("button");
  next.className   = "page-btn";
  next.textContent = "›";
  next.disabled    = (page >= pages);
  next.addEventListener("click", function() { loadFeed(page + 1); scrollToTop(); });
  pag.appendChild(next);

  var info         = document.createElement("span");
  info.className   = "page-info";
  info.textContent = "Page " + page + " of " + pages;
  pag.appendChild(info);
}

function getPageRange(current, total) {
  if (total <= 7) {
    var r = [];
    for (var i = 1; i <= total; i++) r.push(i);
    return r;
  }
  if (current <= 4)         return [1, 2, 3, 4, 5, "...", total];
  if (current >= total - 3) return [1, "...", total-4, total-3, total-2, total-1, total];
  return [1, "...", current-1, current, current+1, "...", total];
}

/* ── Refresh ── */
async function triggerRefresh() {
  var btn         = document.getElementById("refresh-btn");
  btn.disabled    = true;
  btn.textContent = "⟳ Running...";

  try {
    await apiFetch("/api/refresh", { method: "POST" });
    showToast("✅ Refresh started!", "success");

    var attempts = 0;
    var poll = setInterval(async function() {
      attempts++;
      await loadStats();
      await loadAgencies();
      await loadFeed(currentPage);
      if (attempts >= 12) {
        clearInterval(poll);
        btn.disabled    = false;
        btn.textContent = "⟳ Refresh Now";
      }
    }, 5000);
  } catch (err) {
    showToast("❌ Refresh failed: " + err.message, "error");
    btn.disabled    = false;
    btn.textContent = "⟳ Refresh Now";
  }
}

/* ── Logs Modal ── */
async function openLogsModal() {
  document.getElementById("logs-modal").classList.add("open");
  await loadLogs();
}

function closeLogsModal(event) {
  if (!event || event.target === event.currentTarget) {
    document.getElementById("logs-modal").classList.remove("open");
  }
}

async function loadLogs() {
  var tbody = document.getElementById("log-tbody");
  tbody.innerHTML =
    '<tr><td colspan="5" style="color:var(--muted);text-align:center">Loading...</td></tr>';

  try {
    var logs = await apiFetch("/api/logs");

    if (!logs.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="color:var(--muted);text-align:center">No logs yet.</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(function(log) {
      return "<tr>" +
        "<td style='white-space:nowrap'>" + formatDateTime(log.ran_at)  + "</td>" +
        "<td>"  + escHtml(log.source) + "</td>" +
        "<td class='" + (log.status === "success" ? "status-ok" : "status-error") + "'>" +
          (log.status === "success" ? "✔ OK" : "✖ Error") + "</td>" +
        "<td>"  + (log.count != null ? log.count : "—") + "</td>" +
        "<td style='color:var(--red);max-width:180px;word-break:break-word'>" +
          (log.error ? escHtml(log.error.slice(0, 100)) : "—") + "</td>" +
        "</tr>";
    }).join("");
  } catch (err) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="color:var(--red)">Failed to load logs.</td></tr>';
  }
}

/* ── Helpers ── */
async function apiFetch(url, options) {
  var res = await fetch(url, options || {});
  if (!res.ok) {
    var body = await res.json().catch(function() { return {}; });
    throw new Error(body.error || ("HTTP " + res.status));
  }
  return res.json();
}

function showToast(msg, type) {
  var toast         = document.getElementById("toast");
  toast.textContent = msg;
  toast.className   = "show " + (type || "");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function() { toast.className = ""; }, 4000);
}

function debouncedSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function() { loadFeed(1); }, 400);
}

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "…" : str;
}

function isClosingSoon(dateStr) {
  if (!dateStr) return false;
  var d = new Date(dateStr);
  if (isNaN(d)) return false;
  var diff = d - new Date();
  return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
}

function formatRelativeTime(isoStr) {
  if (!isoStr) return "";
  var diff  = Date.now() - new Date(isoStr).getTime();
  var mins  = Math.floor(diff / 60000);
  var hours = Math.floor(diff / 3600000);
  var days  = Math.floor(diff / 86400000);
  if (mins  <  1) return "just now";
  if (mins  < 60) return mins  + "m ago";
  if (hours < 24) return hours + "h ago";
  return days + "d ago";
}

function formatDateTime(isoStr) {
  if (!isoStr) return "—";
  try {
    return new Date(isoStr).toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch(e) { return isoStr; }
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}
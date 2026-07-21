/* ── State ── */
var currentPage   = 1;
var totalPages    = 1;
var searchTimer   = null;
var agencyList    = [];
var currentTab    = "feed";   // "feed" or "interests"
var currentUserId = null;

/* ── Init ── */
document.addEventListener("DOMContentLoaded", function() {
  checkAuth().then(function() {
    loadStats();
    loadAgencies().then(function() { loadFeed(1); });
    setInterval(loadStats, 60000);
  });
});

/* ── Auth Check ── */
async function checkAuth() {
  try {
    var res  = await fetch("/auth/me");
    var data = await res.json();

    if (!data.loggedIn) {
      window.location.href = "/login.html";
      return;
    }

    currentUserId = data.userId;

    var headerRight = document.querySelector(".header-right");
    var userMenu    = document.createElement("div");
    userMenu.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;";

    var userLabel         = document.createElement("button");
    userLabel.className   = "btn-outline btn-sm";
    userLabel.textContent = "👤 " + data.username + (data.role === "admin" ? " ⚙️" : "");
    userLabel.title       = "Edit profile";
    userLabel.addEventListener("click", function() {
      window.location.href = "/profile.html";
    });

    if (data.role === "admin") {
      var adminBtn         = document.createElement("button");
      adminBtn.className   = "btn-outline btn-sm";
      adminBtn.textContent = "⚙️ Admin";
      adminBtn.addEventListener("click", function() {
        window.location.href = "/admin.html";
      });
      userMenu.appendChild(adminBtn);
    }

    var logoutBtn         = document.createElement("button");
    logoutBtn.className   = "btn-outline btn-sm";
    logoutBtn.textContent = "Sign Out";
    logoutBtn.addEventListener("click", doLogout);

    userMenu.appendChild(userLabel);
    userMenu.appendChild(logoutBtn);
    headerRight.insertBefore(userMenu, headerRight.firstChild);

  } catch(err) {
    console.error("Auth check failed:", err);
    window.location.href = "/login.html";
  }
}

/* ── Logout ── */
async function doLogout() {
  try {
    await fetch("/auth/logout", { method: "POST" });
    window.location.href = "/login.html";
  } catch(err) {
    window.location.href = "/login.html";
  }
}

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
    var select  = document.getElementById("agency-filter");
    while (select.options.length > 1) select.remove(1);
    agencyList.forEach(function(a) {
      if (!a.agency) return;
      var opt         = document.createElement("option");
      opt.value       = a.agency;
      opt.textContent = a.agency + " (" + a.count + ")";
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("[loadAgencies] error:", err);
  }
}

function onAgencyDropdownChange() {
  var val = document.getElementById("agency-filter").value;
  document.getElementById("agency-filter").classList.toggle("filter-active", !!val);
  loadFeed(1);
}

/* ── Tabs ── */
function switchTab(tab) {
  currentTab = tab;

  var feedTab      = document.getElementById("tab-feed");
  var interestTab  = document.getElementById("tab-interests");
  var controls     = document.getElementById("controls-bar");
  var pagination   = document.getElementById("pagination");

  if (tab === "feed") {
    feedTab.classList.add("tab-active");
    interestTab.classList.remove("tab-active");
    controls.style.display = "";
    loadFeed(1);
  } else {
    interestTab.classList.add("tab-active");
    feedTab.classList.remove("tab-active");
    controls.style.display = "none";
    pagination.innerHTML   = "";
    loadMyInterests();
  }
}

/* ── Feed ── */
async function loadFeed(page) {
  page        = page || 1;
  currentPage = page;

  var search = document.getElementById("search-input").value.trim();
  var agency = document.getElementById("agency-filter").value;
  var sort   = document.getElementById("sort-select").value;
  var limit  = document.getElementById("limit-select").value;

  var params = new URLSearchParams({ page: page, limit: limit, sort: sort });
  if (search) params.set("search", search);
  if (agency) params.set("agency", agency);

  document.getElementById("search-input").classList.toggle("filter-active", !!search);
  document.getElementById("agency-filter").classList.toggle("filter-active", !!agency);

  var feed = document.getElementById("feed");
  feed.innerHTML =
    '<div class="loading"><div class="spinner"></div><span>Fetching opportunities...</span></div>';

  try {
    var data = await apiFetch("/api/opportunities?" + params.toString());
    totalPages = data.pages || 1;

    if (!data.results || data.results.length === 0) {
      feed.innerHTML =
        '<div class="empty">🔍 No opportunities found.<br>' +
        '<small style="margin-top:8px;display:block">Try a different filter or click <strong>Clear</strong>.</small></div>';
      renderPagination(0, 0);
      return;
    }

    feed.innerHTML = "";
    data.results.forEach(function(item) { feed.appendChild(buildCard(item)); });
    renderPagination(data.page, data.pages);
  } catch (err) {
    feed.innerHTML =
      '<div class="empty" style="color:var(--red)">⚠️ Failed to load feed.<br>' +
      "<small>" + escHtml(err.message) + "</small></div>";
  }
}

/* ── My Interests ── */
async function loadMyInterests() {
  var feed = document.getElementById("feed");
  feed.innerHTML =
    '<div class="loading"><div class="spinner"></div><span>Loading your interests...</span></div>';

  try {
    var data = await apiFetch("/api/my-interests");

    if (!data.results || data.results.length === 0) {
      feed.innerHTML =
        '<div class="empty">⭐ You haven\'t shown interest in any grants yet.<br>' +
        '<small style="margin-top:8px;display:block">Click the <strong>⭐ Show Interest</strong> button on any grant card.</small></div>';
      return;
    }

    feed.innerHTML = "";
    data.results.forEach(function(item) { feed.appendChild(buildCard(item)); });
  } catch (err) {
    feed.innerHTML =
      '<div class="empty" style="color:var(--red)">⚠️ Failed to load interests.<br>' +
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

/* ── Agency filter from card chip ── */
function setAgencyFilter(agencyValue) {
  var select  = document.getElementById("agency-filter");
  var matched = false;

  for (var i = 0; i < select.options.length; i++) {
    if (select.options[i].value === agencyValue) {
      select.value = agencyValue;
      matched = true;
      break;
    }
  }

  if (!matched) {
    var lower = agencyValue.toLowerCase();
    for (var j = 0; j < select.options.length; j++) {
      if (select.options[j].value.toLowerCase().indexOf(lower) !== -1) {
        select.value = select.options[j].value;
        matched = true;
        break;
      }
    }
  }

  if (matched) {
    select.classList.add("filter-active");
    showToast("🏢 Filtering: " + agencyValue, "success");
  } else {
    document.getElementById("search-input").value = agencyValue;
    document.getElementById("search-input").classList.add("filter-active");
    showToast("🔍 Searching: " + agencyValue, "success");
  }

  // Switch to feed tab if on interests tab
  if (currentTab !== "feed") switchTab("feed");
  else loadFeed(1);
  scrollToTop();
}

/* ── Toggle Interest ── */
async function toggleInterest(oppId, btnEl) {
  try {
    btnEl.disabled = true;

    var res  = await fetch("/api/opportunities/" + oppId + "/interest", { method: "POST" });
    var data = await res.json();

    if (!res.ok) {
      showToast("❌ " + (data.error || "Failed"), "error");
      btnEl.disabled = false;
      return;
    }

    // Update button state
    updateInterestButton(btnEl, data.interested, data.count);
    showToast(
      data.interested ? "⭐ Interest added!" : "Interest removed",
      data.interested ? "success" : ""
    );

    btnEl.disabled = false;

    // Refresh interests tab count in tab label
    updateInterestTabLabel();
  } catch(err) {
    showToast("❌ " + err.message, "error");
    btnEl.disabled = false;
  }
}

function updateInterestButton(btn, interested, count) {
  btn.textContent = (interested ? "⭐ Interested" : "☆ Show Interest") +
                    (count > 0 ? " (" + count + ")" : "");
  btn.className   = interested
    ? "interest-btn interest-btn--active"
    : "interest-btn";
}

async function updateInterestTabLabel() {
  try {
    var data  = await apiFetch("/api/my-interests");
    var total = (data && data.total) ? data.total : 0;
    var tab   = document.getElementById("tab-interests");
    if (tab) tab.textContent = "⭐ My Interests" + (total > 0 ? " (" + total + ")" : "");
  } catch(e) {}
}

/* ── Show Interested Users Modal ── */
async function showInterestedUsers(oppId, oppTitle) {
  var modal = document.getElementById("interest-modal");
  var title = document.getElementById("interest-modal-title");
  var body  = document.getElementById("interest-modal-body");

  title.textContent = "Interested in: " + oppTitle;
  body.innerHTML    =
    '<div class="loading"><div class="spinner"></div><span>Loading...</span></div>';
  modal.classList.add("open");

  try {
    var data = await apiFetch("/api/opportunities/" + oppId + "/interest");

    if (!data.users || data.users.length === 0) {
      body.innerHTML =
        '<p style="color:var(--muted);text-align:center;padding:24px">No one has shown interest yet.</p>';
      return;
    }

    body.innerHTML = data.users.map(function(u) {
      var name     = u.display_name || u.username;
      var initial  = name[0].toUpperCase();
      var subtitle = [];
      if (u.job_title)  subtitle.push(u.job_title);
      if (u.company)    subtitle.push(u.company);
      if (u.department) subtitle.push(u.department);

      return '<div class="interest-user-card">' +
        '<div class="interest-avatar">' + escHtml(initial) + '</div>' +
        '<div class="interest-user-info">' +
          '<div class="interest-user-name">' + escHtml(name) +
            (u.role === "admin"
              ? ' <span class="role-badge-sm">admin</span>'
              : "") +
          "</div>" +
          (subtitle.length
            ? '<div class="interest-user-sub">' + escHtml(subtitle.join(" · ")) + "</div>"
            : "") +
          (u.location
            ? '<div class="interest-user-meta">📍 ' + escHtml(u.location) + "</div>"
            : "") +
          (u.email
            ? '<div class="interest-user-meta">✉️ <a href="mailto:' +
              escHtml(u.email) + '" style="color:var(--accent)">' +
              escHtml(u.email) + "</a></div>"
            : "") +
          (u.bio
            ? '<div class="interest-user-bio">' + escHtml(truncate(u.bio, 120)) + "</div>"
            : "") +
          '<div class="interest-user-meta" style="color:var(--muted);font-size:0.72rem">' +
            "Interested " + formatRelativeTime(u.interested_at) +
          "</div>" +
        "</div>" +
      "</div>";
    }).join("");
  } catch(err) {
    body.innerHTML =
      '<p style="color:var(--red);text-align:center;padding:24px">Failed to load: ' +
      escHtml(err.message) + "</p>";
  }
}

function closeInterestModal(event) {
  if (!event || event.target === event.currentTarget) {    document.getElementById("interest-modal").classList.remove("open");
  }
}

/* ── Card Builder ── */
function buildCard(item) {
  var card        = document.createElement("div");
  card.className  = "grant-card";

  /* header */
  var header      = document.createElement("div");
  header.className = "card-header";

  var title       = document.createElement("div");
  title.className = "card-title";
  title.textContent = item.title || "Untitled";

  var badge       = document.createElement("span");
  badge.className = "source-badge";
  badge.textContent = "Grants.gov";

  header.appendChild(title);
  header.appendChild(badge);

  /* summary */
  var summary     = document.createElement("div");
  summary.className = "card-summary";
  summary.textContent = truncate(item.summary || "", 280);

  /* meta chips */
  var meta        = document.createElement("div");
  meta.className  = "card-meta";
  buildMetaChips(item, meta);

  /* ── action row: interest button + view link ── */
  var actions     = document.createElement("div");
  actions.className = "card-actions";

  /* Interest button */
  var intBtn      = document.createElement("button");
  intBtn.className = item.user_interested
    ? "interest-btn interest-btn--active"
    : "interest-btn";
  intBtn.textContent =
    (item.user_interested ? "⭐ Interested" : "☆ Show Interest") +
    (item.interest_count > 0 ? " (" + item.interest_count + ")" : "");

  /* Closure to capture item.id */
  (function(oppId, btn) {
    btn.addEventListener("click", function() {
      toggleInterest(oppId, btn);
    });
  })(item.id, intBtn);

  /* "Who's interested" link — only show if count > 0 */
  var whoBtn = null;
  if (item.interest_count > 0) {
    whoBtn          = document.createElement("button");
    whoBtn.className = "who-btn";
    whoBtn.textContent = "👥 " + item.interest_count +
      (item.interest_count === 1 ? " person" : " people");
    (function(oppId, oppTitle) {
      whoBtn.addEventListener("click", function() {
        showInterestedUsers(oppId, oppTitle);
      });
    })(item.id, item.title);
  }

  /* View link */
  var link        = document.createElement("a");
  link.className  = "card-link";
  link.href       = item.url || "#";
  link.target     = "_blank";
  link.rel        = "noopener noreferrer";
  link.textContent = "View →";

  actions.appendChild(intBtn);
  if (whoBtn) actions.appendChild(whoBtn);
  actions.appendChild(link);

  card.appendChild(header);
  card.appendChild(summary);
  card.appendChild(meta);
  card.appendChild(actions);

  return card;
}

/* ── Meta Chips ── */
function buildMetaChips(item, container) {
  if (item.agency) {
    var chip        = document.createElement("span");
    chip.className  = "meta-chip agency-chip";
    chip.title      = "Click to filter by this agency";
    chip.textContent = "🏢 " + truncate(item.agency, 60);
    chip.dataset.agency = item.agency;
    chip.addEventListener("click", function() {
      setAgencyFilter(this.dataset.agency);
    });
    container.appendChild(chip);
  }

  if (item.category) {
    var cat         = document.createElement("span");
    cat.className   = "meta-chip";
    cat.textContent = "🏷️ " + item.category;
    container.appendChild(cat);
  }

  if (item.posted_date) {
    var posted      = document.createElement("span");
    posted.className = "meta-chip";
    posted.textContent = "📅 Posted: " + item.posted_date;
    container.appendChild(posted);
  }

  if (item.close_date) {
    var cl          = document.createElement("span");
    cl.className    = "meta-chip deadline";
    cl.textContent  = "⏰ Closes: " + item.close_date +
                      (isClosingSoon(item.close_date) ? " ⚠️" : "");
    container.appendChild(cl);
  }

  if (item.award_ceil) {
    var ceil        = document.createElement("span");
    ceil.className  = "meta-chip award";
    ceil.textContent = "💰 Up to $" + Number(item.award_ceil).toLocaleString();
    container.appendChild(ceil);
  }

  if (item.award_floor && item.award_floor !== item.award_ceil) {
    var floor       = document.createElement("span");
    floor.className = "meta-chip award";
    floor.textContent = "💵 Min $" + Number(item.award_floor).toLocaleString();
    container.appendChild(floor);
  }
}

/* ── Pagination ── */
function renderPagination(page, pages) {
  var pag = document.getElementById("pagination");
  pag.innerHTML = "";
  if (pages <= 1) return;

  var prev          = document.createElement("button");
  prev.className    = "page-btn";
  prev.textContent  = "‹";
  prev.disabled     = (page <= 1);
  prev.addEventListener("click", function() { loadFeed(page - 1); scrollToTop(); });
  pag.appendChild(prev);

  var range = getPageRange(page, pages);
  range.forEach(function(p) {
    if (p === "...") {
      var dots        = document.createElement("span");
      dots.className  = "page-info";
      dots.textContent = "…";
      pag.appendChild(dots);
    } else {
      var btn         = document.createElement("button");
      btn.className   = "page-btn" + (p === page ? " active" : "");
      btn.textContent = p;
      btn.addEventListener("click", (function(pg) {
        return function() { loadFeed(pg); scrollToTop(); };
      })(p));
      pag.appendChild(btn);
    }
  });

  var next          = document.createElement("button");
  next.className    = "page-btn";
  next.textContent  = "›";
  next.disabled     = (page >= pages);
  next.addEventListener("click", function() { loadFeed(page + 1); scrollToTop(); });
  pag.appendChild(next);

  var info          = document.createElement("span");
  info.className    = "page-info";
  info.textContent  = "Page " + page + " of " + pages;
  pag.appendChild(info);
}

function getPageRange(current, total) {
  if (total <= 7) {
    var r = [];
    for (var i = 1; i <= total; i++) r.push(i);
    return r;
  }
  if (current <= 4)          return [1, 2, 3, 4, 5, "...", total];
  if (current >= total - 3)  return [1, "...", total-4, total-3, total-2, total-1, total];
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
      if (currentTab === "feed") await loadFeed(currentPage);
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
        "<td style='white-space:nowrap'>" + formatDateTime(log.ran_at) + "</td>" +
        "<td>" + escHtml(log.source) + "</td>" +
        "<td class='" + (log.status === "success" ? "status-ok" : "status-error") + "'>" +
          (log.status === "success" ? "✔ OK" : "✖ Error") + "</td>" +
        "<td>" + (log.count != null ? log.count : "—") + "</td>" +
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
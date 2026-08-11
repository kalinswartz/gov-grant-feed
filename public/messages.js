/* ════════════════════════════════════════
   messages.js — full messaging frontend
════════════════════════════════════════ */

/* ── State ── */
var currentUserId      = null;
var currentUsername    = null;
var activeConvoId      = null;
var allConversations   = [];
var allUsers           = [];
var pollInterval       = null;
var messageOffset      = 0;
var messageTotal       = 0;
var loadingMore        = false;

/* ── Init ── */
// WITH THIS
document.addEventListener("DOMContentLoaded", function () {
  checkAuthMessages().then(function () {
    // Load conversations and users first, then open from URL
    Promise.all([loadConversations(), loadAllUsers()]).then(function () {
      var params = new URLSearchParams(window.location.search);
      var convId = params.get("conversation");
      if (convId) openConversation(parseInt(convId));

      pollInterval = setInterval(function () {
        refreshConversations();
        if (activeConvoId) pollNewMessages();
      }, 10000);
    });
  });
});

/* ── Auth ── */
async function checkAuthMessages() {
  try {
    var res  = await fetch("/auth/me");
    var data = await res.json();
    if (!data.loggedIn) {
      window.location.href = "/login.html";
      return;
    }
    currentUserId   = data.userId;
    currentUsername = data.username;

    // Add user menu to header
    var headerRight = document.querySelector(".header-right");
    var userBtn     = document.createElement("button");
    userBtn.className   = "btn-outline btn-sm";
    userBtn.textContent = "👤 " + data.username;
    userBtn.onclick     = function () { window.location.href = "/profile.html"; };
    headerRight.insertBefore(userBtn, headerRight.firstChild);
  } catch (err) {
    window.location.href = "/login.html";
  }
}

/* ════════════════════════════
   Conversations
════════════════════════════ */
// WITH THIS — explicitly returns the promise so Promise.all can wait on it
async function loadConversations() {
  try {
    var data         = await apiFetch("/api/messages/conversations");
    allConversations = data.conversations || [];
    renderConvoList(allConversations);
    return data;
  } catch (err) {
    document.getElementById("convo-list").innerHTML =
      '<div class="convo-empty">⚠️ Failed to load conversations.<br>' +
      "<small>" + escHtml(err.message) + "</small></div>";
  }
}

async function refreshConversations() {
  try {
    var data         = await apiFetch("/api/messages/conversations");
    allConversations = data.conversations || [];
    renderConvoList(allConversations);
  } catch (e) {}
}

function renderConvoList(convos) {
  var list    = document.getElementById("convo-list");
  var search  = (document.getElementById("convo-search-input").value || "").toLowerCase();
  var filtered = convos.filter(function (c) {
    if (!search) return true;
    var other = getOtherUser(c);
    var name  = other ? (other.display_name || other.username || "") : "";
    return name.toLowerCase().includes(search);
  });

  if (filtered.length === 0) {
    list.innerHTML =
      '<div class="convo-empty">' +
      (search ? "No conversations match your search." :
        "No conversations yet.<br><small>Click <strong>✏️ New</strong> to start one.</small>") +
      "</div>";
    return;
  }

  list.innerHTML = "";
  filtered.forEach(function (conv) {
    var other   = getOtherUser(conv);
    var name    = other ? (other.display_name || other.username) : "Unknown";
    var initial = name[0].toUpperCase();
    var preview = conv.last_message
      ? truncate(conv.last_message.content || "", 45)
      : "No messages yet";
    var timeStr = conv.last_message
      ? formatRelativeTime(conv.last_message.created_at)
      : formatRelativeTime(conv.updated_at);

    var item        = document.createElement("div");
    item.className  = "convo-item" + (conv.id === activeConvoId ? " active" : "");
    item.dataset.id = conv.id;

    item.innerHTML =
      '<div class="convo-avatar">' + escHtml(initial) + "</div>" +
      '<div class="convo-info">' +
        '<div class="convo-name-row">' +
          '<span class="convo-name">' + escHtml(name) + "</span>" +
          '<span class="convo-time">' + escHtml(timeStr) + "</span>" +
        "</div>" +
        '<div class="convo-preview">' +
          (conv.last_message && conv.last_message.sender_id === currentUserId
            ? "You: " : "") +
          escHtml(preview) +
        "</div>" +
      "</div>" +
      (conv.unread_count > 0
        ? '<span class="convo-unread">' + conv.unread_count + "</span>"
        : "");

    (function (id) {
      item.addEventListener("click", function () {
        openConversation(id);
      });
    })(conv.id);

    list.appendChild(item);
  });
}

function filterConvoList() {
  renderConvoList(allConversations);
}

function getOtherUser(conv) {
  if (!conv.other_users || conv.other_users.length === 0) return null;
  return conv.other_users[0];
}

/* ════════════════════════════
   Open a Conversation
════════════════════════════ */
async function openConversation(convId) {
  activeConvoId = convId;
  messageOffset = 0;
  messageTotal  = 0;

  // Highlight active convo in sidebar
  document.querySelectorAll(".convo-item").forEach(function (el) {
    el.classList.toggle("active", parseInt(el.dataset.id) === convId);
  });

  // Mobile: show thread panel
  document.getElementById("convo-sidebar").classList.add("hidden-mobile");
  document.getElementById("thread-panel").classList.add("show-mobile");

  // Find conversation data
  var conv  = allConversations.find(function (c) { return c.id === convId; });
  var other = conv ? getOtherUser(conv) : null;

  // Build thread panel
  var panel = document.getElementById("thread-panel");
  panel.innerHTML =
    // Header
    '<div class="thread-header">' +
      '<div class="thread-header-left">' +
        '<button class="back-btn" onclick="goBackToList()">← Back</button>' +
        '<div class="convo-avatar" style="width:36px;height:36px;font-size:0.9rem">' +
          escHtml(other ? (other.display_name || other.username)[0].toUpperCase() : "?") +
        "</div>" +
        '<div>' +
          '<div class="thread-user-name">' +
            escHtml(other ? (other.display_name || other.username) : "Unknown") +
          "</div>" +
          (other && (other.job_title || other.company)
            ? '<div class="thread-user-sub">' +
                escHtml([other.job_title, other.company].filter(Boolean).join(" · ")) +
              "</div>"
            : "") +
        "</div>" +
      "</div>" +
      '<button class="btn-outline btn-sm" style="color:var(--red,#ef4444)" ' +
        'onclick="confirmDeleteConversation(' + convId + ')">🗑 Delete</button>' +
    "</div>" +
    // Messages area
    '<div class="thread-messages" id="thread-messages">' +
      '<div class="loading"><div class="spinner"></div><span>Loading...</span></div>' +
    "</div>" +
    // Compose bar
    '<div class="compose-bar">' +
      '<textarea id="compose-input" placeholder="Type a message… (Enter to send)" ' +
        'rows="1" oninput="autoResizeTextarea(this)" ' +
        'onkeydown="onComposeKeydown(event)"></textarea>' +
      '<button class="send-btn" id="send-btn" onclick="sendMessage()">Send</button>' +
    "</div>";

  // Load messages
  await loadMessages(convId);

  // Update URL without reload
  history.replaceState(null, "", "/messages.html?conversation=" + convId);

  // Update sidebar unread
  refreshConversations();
}

/* ════════════════════════════
   Messages
════════════════════════════ */
async function loadMessages(convId) {
  var container = document.getElementById("thread-messages");
  if (!container) return;

  try {
    var data     = await apiFetch(
      "/api/messages/conversations/" + convId + "?limit=50&offset=0"
    );
    messageTotal  = data.total || 0;
    messageOffset = data.messages.length;

    container.innerHTML = "";

    // Load more button if there are older messages
    if (data.total > data.messages.length) {
      renderLoadMoreBtn(container, convId);
    }

    if (data.messages.length === 0) {
      container.innerHTML +=
        '<div style="text-align:center;color:var(--muted);padding:40px 0;font-size:0.88rem">' +
        "No messages yet. Say hello! 👋</div>";
    } else {
      renderMessages(container, data.messages);
    }

    scrollToBottom();
  } catch (err) {
    container.innerHTML =
      '<div style="color:var(--red);text-align:center;padding:40px">' +
      "⚠️ Failed to load messages: " + escHtml(err.message) + "</div>";
  }
}

async function pollNewMessages() {
  if (!activeConvoId) return;
  var container = document.getElementById("thread-messages");
  if (!container) return;

  try {
    var data = await apiFetch(
      "/api/messages/conversations/" + activeConvoId + "?limit=50&offset=0"
    );

    // Only re-render if message count changed
    if (data.messages.length !== messageOffset) {
      messageOffset = data.messages.length;
      messageTotal  = data.total;

      // Remove old messages (keep load-more btn if present)
      var loadMoreBtn = container.querySelector(".load-more-btn");
      container.innerHTML = "";
      if (data.total > data.messages.length) {
        renderLoadMoreBtn(container, activeConvoId);
      }
      renderMessages(container, data.messages);
      scrollToBottom();
    }
  } catch (e) {}
}

function renderMessages(container, messages) {
  var lastDate = null;

  messages.forEach(function (msg, idx) {
    // Date divider
    var msgDate = new Date(msg.created_at).toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric"
    });
    if (msgDate !== lastDate) {
      var divider       = document.createElement("div");
      divider.className = "date-divider";
      divider.textContent = msgDate;
      container.appendChild(divider);
      lastDate = msgDate;
    }

    container.appendChild(buildMessageRow(msg, messages[idx - 1]));
  });
}

function buildMessageRow(msg, prevMsg) {
  var isOwn     = msg.sender_id === currentUserId;
  var sender    = msg.sender;
  var name      = sender ? (sender.display_name || sender.username) : "?";
  var initial   = name[0].toUpperCase();

  // Hide avatar if same sender as previous message
  var sameAsPrev = prevMsg && prevMsg.sender_id === msg.sender_id;

  var row        = document.createElement("div");
  row.className  = "msg-row" + (isOwn ? " own" : "");
  row.dataset.id = msg.id;

  var avatarHtml = sameAsPrev
    ? '<div class="msg-avatar" style="visibility:hidden"></div>'
    : '<div class="msg-avatar ' + (isOwn ? "" : "other") + '">' +
        escHtml(initial) + "</div>";

  var bubbleContent;
  if (msg.is_deleted) {
    bubbleContent = '<em style="opacity:0.5;font-size:0.82rem">Message deleted</em>';
  } else {
    bubbleContent = escHtml(msg.content);
  }

  row.innerHTML =
    avatarHtml +
    '<div class="msg-body">' +
      '<div class="msg-bubble' + (msg.is_deleted ? " deleted" : "") + '">' +
        bubbleContent +
      "</div>" +
      '<div class="msg-meta">' +
        formatTimeOnly(msg.created_at) +
        "</div>"
    "</div>";

  return row;
}

function renderLoadMoreBtn(container, convId) {
  var btn        = document.createElement("button");
  btn.className  = "btn-outline btn-sm load-more-btn";
  btn.style.cssText =
    "display:block;margin:0 auto 16px;font-size:0.8rem";
  btn.textContent = "⬆ Load older messages";
  btn.addEventListener("click", function () {
    loadOlderMessages(convId, btn);
  });
  container.appendChild(btn);
}

async function loadOlderMessages(convId, btn) {
  if (loadingMore) return;
  loadingMore    = true;
  btn.textContent = "Loading...";
  btn.disabled   = true;

  try {
    var data = await apiFetch(
      "/api/messages/conversations/" + convId +
      "?limit=50&offset=" + messageOffset
    );
    var container = document.getElementById("thread-messages");

    // Remove load more btn
    btn.remove();

    // Prepend older messages
    var frag    = document.createDocumentFragment();
    var tempDiv = document.createElement("div");
    renderMessages(tempDiv, data.messages);
    while (tempDiv.firstChild) frag.appendChild(tempDiv.firstChild);

    container.insertBefore(frag, container.firstChild);
    messageOffset += data.messages.length;

    // Add load more again if still more
    if (messageTotal > messageOffset) {
      renderLoadMoreBtn(container, convId);
      container.insertBefore(
        container.lastChild,
        container.firstChild
      );
    }
  } catch (err) {
    btn.textContent = "⬆ Load older messages";
    btn.disabled    = false;
    showToast("Failed to load older messages", "error");
  } finally {
    loadingMore = false;
  }
}

/* ════════════════════════════
   Send Message
════════════════════════════ */
async function sendMessage() {
  if (!activeConvoId) return;

  var textarea = document.getElementById("compose-input");
  var sendBtn  = document.getElementById("send-btn");
  var content  = (textarea.value || "").trim();

  if (!content) return;
  if (content.length > 5000) {
    showToast("Message too long (max 5000 chars)", "error");
    return;
  }

  textarea.disabled = true;
  sendBtn.disabled  = true;
  sendBtn.textContent = "...";

  try {
    var data = await apiFetch(      "/api/messages/conversations/" + activeConvoId,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content }),
      }
    );

    textarea.value   = "";
    textarea.style.height = "auto";
    textarea.disabled = false;
    sendBtn.disabled  = false;
    sendBtn.textContent = "Send";
    textarea.focus();

    // Append new message to thread
    var container = document.getElementById("thread-messages");
    if (container) {
      // Remove "no messages" placeholder if present
      var empty = container.querySelector("[data-empty]");
      if (empty) empty.remove();

      var prevMsgs = container.querySelectorAll(".msg-row");
      var prevMsg  = prevMsgs.length > 0
        ? { sender_id: parseInt(prevMsgs[prevMsgs.length - 1].dataset.senderId) }
        : null;

      var newRow = buildMessageRow(data.message, prevMsg);
      container.appendChild(newRow);
      messageOffset++;
      scrollToBottom();
    }

    // Refresh conversation list to update preview
    refreshConversations();

  } catch (err) {
    showToast("❌ Failed to send: " + err.message, "error");
    textarea.disabled   = false;
    sendBtn.disabled    = false;
    sendBtn.textContent = "Send";
  }
}

function onComposeKeydown(e) {
  // Enter sends, Shift+Enter adds newline
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}


/* ════════════════════════════
   Delete Conversation
════════════════════════════ */
async function confirmDeleteConversation(convId) {
  if (!confirm("Delete this entire conversation? This cannot be undone.")) return;

  try {
    await apiFetch("/api/messages/conversations/" + convId, { method: "DELETE" });

    activeConvoId = null;
    showToast("Conversation deleted", "");

    // Reset thread panel
    document.getElementById("thread-panel").innerHTML =
      '<div class="no-convo">' +
        '<div class="no-convo-icon">💬</div>' +
        '<div>Select a conversation or start a new one</div>' +
        '<button class="btn-primary btn-sm" onclick="openNewMessageModal()">✏️ New Message</button>' +
      "</div>";

    // Mobile: go back to list
    goBackToList();

    // Refresh list
    await loadConversations();
    history.replaceState(null, "", "/messages.html");
  } catch (err) {
    showToast("❌ Failed to delete: " + err.message, "error");
  }
}

/* ════════════════════════════
   New Message Modal
════════════════════════════ */
async function loadAllUsers() {
  try {
    var data = await apiFetch("/api/users");
    // Filter out current user
    allUsers = (data.users || data || []).filter(function (u) {
      return u.id !== currentUserId;
    });
  } catch (err) {
    console.error("Failed to load users:", err);
  }
}

function openNewMessageModal() {
  document.getElementById("new-msg-modal").classList.add("open");
  document.getElementById("new-msg-search").value = "";
  renderUserList(allUsers);
  setTimeout(function () {
    document.getElementById("new-msg-search").focus();
  }, 100);
}

function closeNewMessageModal(event) {
  if (!event || event.target === event.currentTarget) {
    document.getElementById("new-msg-modal").classList.remove("open");
  }
}

function filterUserList() {
  var search  = (document.getElementById("new-msg-search").value || "").toLowerCase();
  var filtered = allUsers.filter(function (u) {
    var name = (u.display_name || u.username || "").toLowerCase();
    var co   = (u.company || "").toLowerCase();
    return name.includes(search) || co.includes(search);
  });
  renderUserList(filtered);
}

function renderUserList(users) {
  var list = document.getElementById("new-msg-user-list");

  if (!users || users.length === 0) {
    list.innerHTML =
      '<div style="padding:20px;text-align:center;color:var(--muted);font-size:0.88rem">' +
      "No users found.</div>";
    return;
  }

  list.innerHTML = "";
  users.forEach(function (u) {
    var name     = u.display_name || u.username;
    var initial  = name[0].toUpperCase();
    var subtitle = [u.job_title, u.company, u.department]
      .filter(Boolean).join(" · ");

    var item        = document.createElement("div");
    item.className  = "new-msg-user-item";
    item.innerHTML  =
      '<div class="new-msg-user-avatar">' + escHtml(initial) + "</div>" +
      '<div class="new-msg-user-info">' +
        '<div class="name">' + escHtml(name) +
          (u.role === "admin"
            ? ' <span class="role-badge-sm">admin</span>'
            : "") +
        "</div>" +
        (subtitle
          ? '<div class="sub">' + escHtml(truncate(subtitle, 60)) + "</div>"
          : "") +
        (u.location
          ? '<div class="sub">📍 ' + escHtml(u.location) + "</div>"
          : "") +
      "</div>";

    (function (userId) {
      item.addEventListener("click", async function () {
        closeNewMessageModal();
        await startConversationWith(userId);
      });
    })(u.id);

    list.appendChild(item);
  });
}

async function startConversationWith(targetUserId) {
  try {
    showToast("Opening conversation...", "");
    var data = await apiFetch("/api/messages/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_user_id: targetUserId }),
    });

    await loadConversations();
    openConversation(data.conversation_id);
  } catch (err) {
    showToast("❌ " + err.message, "error");
  }
}

/* ════════════════════════════
   Mobile back button
════════════════════════════ */
function goBackToList() {
  document.getElementById("convo-sidebar").classList.remove("hidden-mobile");
  document.getElementById("thread-panel").classList.remove("show-mobile");
  activeConvoId = null;
  history.replaceState(null, "", "/messages.html");
}

/* ════════════════════════════
   Helpers
════════════════════════════ */
function scrollToBottom() {
  var container = document.getElementById("thread-messages");
  if (container) container.scrollTop = container.scrollHeight;
}

async function apiFetch(url, options) {
  var res = await fetch(url, options || {});
  if (!res.ok) {
    var body = await res.json().catch(function () { return {}; });
    throw new Error(body.error || "HTTP " + res.status);
  }
  return res.json();
}

function showToast(msg, type) {
  var toast         = document.getElementById("toast");
  toast.textContent = msg;
  toast.className   = "show " + (type || "");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function () { toast.className = ""; }, 4000);
}

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Escape for use inside JS string literals in onclick attributes
function escJs(str) {
  if (!str) return "";
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "…" : str;
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

function formatTimeOnly(isoStr) {
  if (!isoStr) return "";
  try {
    return new Date(isoStr).toLocaleTimeString(undefined, {
      hour:   "2-digit",
      minute: "2-digit",
    });
  } catch (e) { return ""; }
}
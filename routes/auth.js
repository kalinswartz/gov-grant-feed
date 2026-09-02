const express = require("express");
const bcrypt  = require("bcryptjs");
const router  = express.Router();
const db      = require("../db");

/* ── Middleware ── */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ error: "Not authenticated" });
}

async function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const user = await db.users.findById(req.session.userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

/* ── POST /auth/register ── */
router.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const allUsers    = await db.users.getAll();
    const isFirstUser = allUsers.length === 0;
    const hashed      = await bcrypt.hash(password, 12);
    let   user        = await db.users.create(username, hashed);

    if (isFirstUser) {
      user = await db.users.updateRole(user._id, "admin");
    }

    req.session.userId   = String(user._id);
    req.session.username = user.username;
    req.session.role     = user.role;

    res.json({ message: "Account created", username: user.username, role: user.role });
  } catch (err) {
    if (err.message === "Username already taken") {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /auth/login ── */
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const user = await db.users.findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    req.session.userId   = String(user._id);
    req.session.username = user.username;
    req.session.role     = user.role;

    res.json({ message: "Logged in", username: user.username, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /auth/logout ── */
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out" });
  });
});

/* ── GET /auth/me ── */
router.get("/me", (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.json({ loggedIn: false });
  }
  res.json({
    loggedIn: true,
    username: req.session.username,
    role:     req.session.role,
    userId:   req.session.userId,
  });
});

/* ── GET /auth/profile ── */
router.get("/profile", requireAuth, async (req, res) => {
  try {
    const profile = await db.users.getProfile(req.session.userId);
    if (!profile) return res.status(404).json({ error: "User not found" });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── PUT /auth/profile ── */
router.put("/profile", requireAuth, async (req, res) => {
  try {

    const {
      display_name, company, job_title,
      department, email, phone, location, bio,
      interests, expertise, projects,
    } = req.body;

    const updated = await db.users.updateProfile(req.session.userId, {
      display_name, company, job_title,
      department, email, phone, location, bio,
      interests, expertise, projects,
    });

    if (display_name !== undefined) {
      req.session.displayName = display_name;
    }

    const { password, ...safe } = updated;
    res.json({ message: "Profile updated", profile: safe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── PUT /auth/password ── */
router.put("/password", requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: "Both current and new password required" });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    const user = await db.users.findById(req.session.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(current_password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const hashed = await bcrypt.hash(new_password, 12);
    await db.users.updatePassword(req.session.userId, hashed);

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /auth/users (admin) ── */
router.get("/users", requireAdmin, async (req, res) => {
  try {
    res.json(await db.users.getAll());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── DELETE /auth/users/:id (admin) ── */
router.delete("/users/:id", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    if (id === req.session.userId) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }
    const deleted = await db.users.delete(id);
    if (!deleted) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── PUT /auth/users/:id/role (admin) ── */
router.put("/users/:id/role", requireAdmin, async (req, res) => {
  try {
    const id       = req.params.id;
    const { role } = req.body;
    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ error: "Role must be 'user' or 'admin'" });
    }
    const user = await db.users.updateRole(id, role);
    res.json({ message: "Role updated", user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, requireAuth, requireAdmin };
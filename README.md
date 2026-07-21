# TTI Funding Opportunities Feed

A self-hosted daily feed that scrapes government grant and funding
opportunities from Grants.gov and displays them in a searchable,
filterable UI built for Texas A&M Transportation Institute.

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment

Create a `.env` file in the project root:

```env
PORT=3000
CRON_SCHEDULE=0 0 * * *
SESSION_SECRET=your_secret_here
```

**Generating a secure `SESSION_SECRET`:**
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Copy the output and paste it as the value of `SESSION_SECRET`.

> ⚠️ **Never share or commit your `.env` file.**
> The `SESSION_SECRET` is used to sign login session cookies.
> If someone obtains it they can forge sessions and log in as any user.
> Always use a long random string — never use the default placeholder.

### 3. Start the server
```bash
# Production
npm start

# Development (auto-restart on file changes)
npm run dev
```

### 4. Open the app
```
http://localhost:3000
```

### 5. Create your account
- On first load you'll be redirected to the login page
- Click **Create Account**
- The **first account created is automatically an admin**
- All subsequent accounts are regular users

---

## File Structure

```
gov-grant-feed/
│
├── server.js           ← Express server + cron scheduler
├── db.js               ← JSON file database layer
├── .env                ← Environment config (never commit this)
│
├── scrapers/
│   ├── index.js        ← Runs all scrapers + upserts results
│   └── grants_gov.js   ← Grants.gov search2 API scraper
│
├── routes/
│   ├── api.js          ← Feed/grants API endpoints
│   └── auth.js         ← Login/register/profile endpoints
│
├── public/
│   ├── index.html      ← Main feed page
│   ├── login.html      ← Login / register page
│   ├── profile.html    ← User profile editor
│   ├── admin.html      ← Admin user management
│   ├── app.js          ← Frontend JavaScript
│   └── styles.css      ← Styles
│
├── grants.json         ← Grant data (auto-created)
├── users.json          ← User accounts (auto-created)
├── interests.json      ← Interest records (auto-created)
└── sessions/           ← Login sessions (auto-created)
```

---

## Data Files

| File | Contents | Backup? |
|---|---|---|
| `grants.json` | All scraped grant opportunities + fetch logs | Optional |
| `users.json` | User accounts with hashed passwords | ✅ Yes |
| `interests.json` | Who is interested in which grants | ✅ Yes |
| `sessions/` | Active login sessions — expire after 7 days | No |

> Passwords are **never stored in plain text** — they are hashed
> with bcrypt before saving.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: `3000`) |
| `SESSION_SECRET` | **Yes** | Secret key for signing session cookies — must be long and random |
| `CRON_SCHEDULE` | No | Cron expression for scrape schedule (default: midnight daily) |

---

## Cron Schedule Reference

| Schedule | Expression |
|---|---|
| Every minute (testing) | `*/1 * * * *` |
| Every hour | `0 * * * *` |
| Midnight daily | `0 0 * * *` |
| 6 AM daily | `0 6 * * *` |
| Mon–Fri at 8 AM | `0 8 * * 1-5` |

---

## API Endpoints

All endpoints require login except `/auth/*`.

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Log in |
| POST | `/auth/logout` | Log out |
| GET | `/auth/me` | Current session info |
| GET | `/auth/profile` | Get your profile |
| PUT | `/auth/profile` | Update your profile |
| PUT | `/auth/password` | Change your password |
| GET | `/auth/users` | List all users (admin only) |
| DELETE | `/auth/users/:id` | Delete a user (admin only) |
| PUT | `/auth/users/:id/role` | Change a user's role (admin only) |

### Grants
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/opportunities` | List grants (paginated, filterable) |
| GET | `/api/opportunities/:id` | Single grant with interested users |
| GET | `/api/agencies` | All agencies with counts |
| GET | `/api/stats` | Summary stats |
| GET | `/api/logs` | Scrape run history |
| POST | `/api/refresh` | Trigger a manual scrape |
| POST | `/api/opportunities/:id/interest` | Toggle interest on a grant |
| GET | `/api/opportunities/:id/interest` | List users interested in a grant |
| GET | `/api/my-interests` | All grants you're interested in |

---

## `.gitignore`

Make sure this file exists so sensitive data is never committed:

```
node_modules/
sessions/
grants.json
users.json
interests.json
.env
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm install` fails | You're on Node v24 — `better-sqlite3` won't compile, but this app uses JSON files so it doesn't matter. Run `npm install` again. |
| Feed is empty | Click **⟳ Refresh Now** or wait for startup scrape to finish |
| Redirected to login immediately | Session expired — log in again |
| Forgot admin password | Open `users.json`, delete your user entry, restart and re-register |
| Port already in use | Change `PORT=3001` in `.env` |
| `SESSION_SECRET` warning | Generate a real secret with the command above |
| Cron not firing | Verify expression at [crontab.guru](https://crontab.guru) |
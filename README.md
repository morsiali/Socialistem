# Socialistem

AI social media management platform for socialistem.com: write once for 8 channels, queue, calendar,
approvals, inbox, analytics, listening and an AI assistant, with member and admin accounts.

## Run locally
```
cp .env.example .env          # add ANTHROPIC_API_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
node --env-file=.env server/index.js
# open http://localhost:3000
npm test                      # 42 tests: core logic + API integration (mock Claude API)
```
Node 22.13 or newer. No npm dependencies: the server uses Node's built-in HTTP and SQLite.

## Pages
| Path | Who | What |
|---|---|---|
| `/` | everyone | Landing page with the prompt box |
| `/signup`, `/login` | everyone | Accounts |
| `/app` | members | Dashboard, composer, queue, calendar, approvals, ideas, inbox, analytics, listening, AI assistant, settings, account |
| `/admin` | admins | Overview metrics, members (roles, plans, suspend, reset password, delete), activity log, platform settings |

## Layout
```
server/index.js        start the server
server/app.js          request handling, pages, admin seeding
server/routes/         auth & account, workspace, ai, admin
server/ai.js           Claude Messages API client (streaming)
server/db.js           SQLite schema and settings
server/scheduler.js    publishes due posts (simulated; plug channel APIs into publishToChannel)
public/                landing, login, member app, admin console
test/                  core.test.js, api.test.js
render.yaml, DEPLOY.md hosting on Render + Namecheap DNS
```

## Security
scrypt password hashing, HttpOnly session cookies, CSRF header + origin check, login rate limiting,
CSP and security headers, per-user data isolation, AI prompts built on the server, daily AI quotas per plan,
audit log of admin actions, last-admin protection.

## Still simulated
Channel connections and publishing, inbox messages, analytics and listening data. Real publishing needs
developer apps approved by Meta, LinkedIn, X, TikTok, YouTube and Pinterest. Password reset by email needs
an email provider (admins can reset passwords from the console today). Payments for plans are not wired up.

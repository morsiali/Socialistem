# Socialistem

AI social media management platform for socialistem.com: write once for 8 channels, queue, calendar,
approvals, inbox, analytics, listening and an AI assistant, with member and admin accounts.

## Run locally
```
cp .env.example .env          # add ANTHROPIC_API_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
node --env-file=.env server/index.js
# open http://localhost:3000
npm test                      # 55 tests: core logic, API, and channel publishing against mock networks
```
Node 22.13 or newer. No npm dependencies: the server uses Node's built-in HTTP and SQLite.

## Pages
| Path | Who | What |
|---|---|---|
| `/` | everyone | Landing page with the prompt box |
| `/signup`, `/login` | everyone | Accounts |
| `/app` | members | Dashboard, composer, queue, calendar, approvals, ideas, inbox, analytics, listening, AI assistant, settings, account |
| `/admin` | admins | Overview metrics, channel status, members (roles, plans, suspend, reset password, delete), activity log, platform settings |
| `/privacy` | everyone | Privacy and data-deletion page (needed for Meta app review) |
| `/auth/connect/<network>` | members | Starts the sign-in with LinkedIn, X, Meta or Threads |

## Layout
```
server/index.js        start the server
server/app.js          request handling, pages, admin seeding
server/routes/         auth & account, workspace, ai, admin
server/ai.js           Claude Messages API client (streaming)
server/db.js           SQLite schema and settings
server/channels.js     LinkedIn, X, Facebook/Instagram and Threads: OAuth, encrypted tokens, publishing
server/scheduler.js    publishes due posts through each member's connected accounts
public/                landing, login, member app, admin console
test/                  core.test.js, api.test.js
render.yaml, DEPLOY.md hosting on Render + Namecheap DNS
```

## Security
scrypt password hashing, HttpOnly session cookies, CSRF header + origin check, login rate limiting,
CSP and security headers, per-user data isolation, AI prompts built on the server, daily AI quotas per plan,
audit log of admin actions, last-admin protection.

## Publishing
Members connect LinkedIn, Facebook Pages, Instagram professional accounts, X and Threads in Settings, then
publish now or on a schedule. Each network is switched on by adding its developer-app keys (CHANNELS.md).
Failed posts show the network's reason and a Retry button; networks that already succeeded are never posted twice.
Admins can turn on practice mode for demos (unconnected channels are marked as published without posting).

## Still simulated
Inbox messages, analytics and listening data. TikTok, YouTube and Pinterest publishing. Password reset by
email needs an email provider (admins can reset passwords from the console today). Payments are not wired up.

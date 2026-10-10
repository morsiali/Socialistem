# Put Socialistem live on socialistem.com

Hosting: **Render** (Node server + persistent disk, free TLS). DNS stays at **Namecheap**.
Cost at the time of writing: about $7/month for the smallest paid instance + $0.25/GB/month for the disk,
plus your Claude API usage.

## 1. Get the keys ready (5 min)
- **Claude API key**: https://platform.claude.com → API keys → Create key. Add billing credit.
- **Admin login**: pick the email and a strong password (8+ characters, a letter and a number).

## 2. Put the code on GitHub (5 min)
1. Create a new **private** repository on github.com, e.g. `socialistem`.
2. Upload the contents of this folder (or `git init && git add . && git commit -m "Socialistem" && git push`).

## 3. Create the service on Render (10 min)
1. Sign up at https://render.com and connect your GitHub account.
2. **New → Blueprint** → pick the `socialistem` repository. Render reads `render.yaml`.
3. Fill in the values it asks for:
   - `ANTHROPIC_API_KEY` = your Claude API key
   - `ADMIN_EMAIL` = your admin email
   - `ADMIN_PASSWORD` = your admin password
   - `SUPPORT_EMAIL` = the address shown for password help (e.g. hello@socialistem.com)
4. Click **Apply**. The first deploy takes a few minutes. When it finishes you get an address like
   `https://socialistem.onrender.com` (yours may differ). Open it and check the site loads.

## 4. Point the domain at Render (Namecheap, 5 min)
Render already has `socialistem.com` (and the www redirect) from `render.yaml`. In the Render service,
open **Settings → Custom Domains** to see them.

In Namecheap: **Domain List → Manage (socialistem.com) → Advanced DNS**
1. Delete any `A` records for host `@`, any `AAAA` records, and any `CNAME`, URL Redirect or parking records for `@` and `www`.
2. Add **A Record**: Host `@` · Value `216.24.57.1` · TTL 1 min
3. Add **CNAME Record**: Host `www` · Value `<your-service>.onrender.com` (from step 3) · TTL 1 min
4. Back in Render → Custom Domains → **Verify**. The HTTPS certificate is issued automatically.

DNS usually updates within minutes, sometimes up to a few hours.

## 5. Log in
- Admin console: https://socialistem.com/admin (use ADMIN_EMAIL / ADMIN_PASSWORD)
- Member app: https://socialistem.com/app
- Change the admin password from **Account** after the first login.

## Updating the site later
Push to the GitHub repository; Render redeploys automatically. The database lives on the disk at
`/var/data` and survives deploys. Take a manual backup from Render's **Disks → Snapshots**.

## Other hosts
`Dockerfile` runs anywhere that takes a container (Fly.io, Railway, a VPS). Mount a volume at `/data`.

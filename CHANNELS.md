# Switch on live publishing: LinkedIn, Facebook + Instagram, X, Threads

Each network only lets an app post for people after the app's owner registers it. You create one developer
app per network (two for Meta: one for Facebook + Instagram, one for Threads), paste its keys into Render, and
the matching **Connect** button in every member's Settings starts working.

Do these steps signed in as yourself on each network. You type every key and secret into Render yourself;
never paste them into a chat or an email.

| Network | Developer site | Redirect URL to register | Render keys |
|---|---|---|---|
| LinkedIn | https://www.linkedin.com/developers/apps | `https://socialistem.com/auth/callback/linkedin` | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` |
| Facebook + Instagram | https://developers.facebook.com/apps | `https://socialistem.com/auth/callback/meta` | `META_APP_ID`, `META_APP_SECRET` |
| X | https://developer.x.com/en/portal/dashboard | `https://socialistem.com/auth/callback/x` | `X_CLIENT_ID`, `X_CLIENT_SECRET` |
| Threads | https://developers.facebook.com/apps | `https://socialistem.com/auth/callback/threads` | `THREADS_APP_ID`, `THREADS_APP_SECRET` |

Useful addresses for the forms: website `https://socialistem.com`, privacy policy `https://socialistem.com/privacy`,
data deletion instructions `https://socialistem.com/data-deletion`, app icon `https://socialistem.com/assets/favicon.svg`.

Developer portals change their menus often. If a button below has moved, look for the same setting name.

---

## 1. LinkedIn (about 10 minutes, no review)
1. Open https://www.linkedin.com/developers/apps → **Create app**.
2. App name `Socialistem`, LinkedIn Page: pick your company page (create one first if you have none), privacy
   policy URL, logo. Accept the terms → **Create app**.
3. **Products** tab → **Request access** for **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect**.
   Both are approved instantly.
4. **Auth** tab → **Authorized redirect URLs** → add `https://socialistem.com/auth/callback/linkedin` → Update.
5. Copy **Client ID** and **Primary Client Secret** (same Auth tab).

Posts go to the member's personal profile. Posting as a LinkedIn company page needs LinkedIn's separate
Community Management API approval, which is not part of this release.

## 2. Facebook Pages + Instagram (30 minutes to set up; App Review before the public can use it)
1. Open https://developers.facebook.com/apps → **Create app**.
2. Use case: **Manage everything on your Page** (if offered, also add **Manage messaging & content on Instagram**).
   App type, if asked: **Business**. Connect your Business portfolio if you have one.
3. **App settings → Basic**: add privacy policy URL `https://socialistem.com/privacy`, data deletion instructions URL
   `https://socialistem.com/data-deletion`, app icon, category. Save. Copy **App ID** and **App secret**.
4. **Facebook Login for Business** (or **Facebook Login**) → **Settings** → **Valid OAuth Redirect URIs** →
   `https://socialistem.com/auth/callback/meta` → Save.
5. **Use cases / Permissions**: make sure these are added: `pages_show_list`, `pages_manage_posts`,
   `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`, `business_management`.
6. Instagram accounts must be **Professional** (Business or Creator) and **linked to a Facebook Page**
   (Instagram app → Settings → Account type and tools; then link it in the Page's settings).

While the app is in **Development** mode only people with a role on the app (App roles → Roles: admins,
developers, testers) can connect. That is enough to test with your own Page and Instagram.
To let every member connect: complete **Business verification**, then **App Review** for the permissions in step 5
(Meta asks for a short screen recording of connecting and publishing from Socialistem), then switch the app to **Live**.

Instagram limits: an image is required, JPEG, aspect ratio between 4:5 and 1.91:1 (Socialistem crops for you),
and 100 published posts per account per 24 hours.

## 3. X (15 minutes; posting may need a paid API plan)
1. Open https://developer.x.com/en/portal/dashboard and sign up for developer access (describe the use: "Let my
   customers schedule and publish their own posts from my social media tool").
2. In your **Project → App** → **User authentication settings → Set up**:
   - App permissions: **Read and write**
   - Type of App: **Web App, Automated App or Bot** (confidential client)
   - Callback URI: `https://socialistem.com/auth/callback/x`
   - Website URL: `https://socialistem.com`
3. **Keys and tokens** → **OAuth 2.0 Client ID and Client Secret** → copy both (the secret is shown once).

Check X's current API pricing on the developer site before you rely on it: the free access level has a small
monthly cap on posts per app, and higher volumes need a paid plan. When the cap is reached, Socialistem shows X's
error on the post and the member can retry later.

## 4. Threads (20 minutes; App Review before the public can use it)
1. Open https://developers.facebook.com/apps → **Create app** (a separate app from step 2).
2. Use case: **Access the Threads API**.
3. **Use cases → Threads API → Customize/Settings**: add `threads_basic` and `threads_content_publish`;
   **Redirect Callback URLs** → `https://socialistem.com/auth/callback/threads`; also fill the uninstall and delete
   callback URLs with `https://socialistem.com/data-deletion`.
4. Copy the **Threads App ID** and **Threads App secret** shown on that settings page (they differ from the
   main app ID).
5. Testing before review: **App roles → Roles → Add people → Threads Tester**, enter your Threads username, then
   accept the invite in the Threads app (Settings → Account → Website permissions → Invites).

Like Meta, other members can connect after App Review and switching the app to Live.

---

## 5. Paste the keys into Render (you do this)
1. https://dashboard.render.com → **socialistem** service → **Environment**.
2. **Add environment variable** for each key you have, for example `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`.
3. **Save, rebuild, and deploy**. After about two minutes, the network shows **Ready** in Admin → Overview → Social channels,
   and members see a **Connect** button for it in Settings.

You can add networks one at a time. Ones without keys show "Not available yet" to members instead of failing.

## 6. Test it
1. Log in as a member at https://socialistem.com/app → **Settings** → **Connect** next to the network.
2. Approve on the network's page; you return to Settings with the account listed.
3. **Create post** → choose the channel → write the text (add an image for Instagram) → **When: Now** → **Publish now**.
4. The post moves to **Queue → Sent** with a **View post** link for each network. If a network refuses it, the post
   shows the reason under **Queue → Needs attention** with a **Retry** button.

## Practice mode (optional)
Admin → Settings → **Practice mode** marks posts to channels a member has not connected as published without
posting them. It is meant for demos while app reviews are pending. Keep it off for real use.

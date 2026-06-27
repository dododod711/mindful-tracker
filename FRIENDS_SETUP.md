# Turning on Lumen Friends

Lumen is on-device by default. **Friends** is the one optional feature that uses a
tiny private backend so you and people you approve can see each other's mood and
streak and send encouragement. It runs on **Supabase** (free tier, no credit card).

Only your **mood, streak, last check-in date, and an optional short status** are
ever shared — and only with friends who have accepted you. Your **journal entries,
notes, sleep/energy/stress, and tags never leave your device.**

Setup takes about 3 minutes.

## 1. Create a Supabase project

1. Go to <https://supabase.com> → **Start your project** → sign in with GitHub.
2. **New project**. Pick a name (e.g. `lumen`), set a database password (save it
   somewhere), choose the nearest region, and create it. Give it ~1 minute to spin up.

## 2. Run the database schema

1. In your project, open **SQL Editor** (left sidebar) → **New query**.
2. Open [`supabase-schema.sql`](supabase-schema.sql) from this repo, copy the whole
   file, paste it in, and click **Run**. You should see "Success. No rows returned".
   This creates the tables, the row-level-security rules, and the helper functions.

## 3. (Recommended for testing) Allow instant sign-ups

By default Supabase emails a confirmation link before a new account can sign in.
For quick testing with a friend:

- **Authentication → Providers → Email** → turn **Confirm email** *off* → Save.

Leave it **on** if you'd rather verify emails (users just click the link in their
inbox before their first sign-in).

## 4. Add your keys to Lumen

1. In Supabase: **Project Settings → API**. Copy:
   - **Project URL** (e.g. `https://abcd1234.supabase.co`)
   - **anon / public** API key (the long one labelled `anon` `public`)
2. Open [`config.js`](config.js) in this repo and paste them in:

   ```js
   window.LUMEN_CONFIG = {
     SUPABASE_URL: "https://abcd1234.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGciOi...your anon key...",
   };
   ```

   Both values are **safe to commit and ship publicly** — the anon key is meant for
   browsers, and all real access is enforced by the row-level-security rules from
   step 2.
3. Commit and push. Vercel redeploys, and the **Friends** tab goes live.

## 5. Try it

1. Open the **Friends** page → **Create account** (username + email + password).
2. Have a friend do the same on their device.
3. Add each other by username → accept the request.
4. Do a check-in on the **Check-in** page — your mood/streak now show up for your
   friend (hit **↻** to refresh), and you can tap **Encourage** to send support.

## Notes & limits

- **Guests:** anyone can use Lumen as a guest from the Friends page — the whole app
  works on-device with no account. Connecting with friends is the only thing that
  requires signing in, so guests can explore freely but can't add or be added until
  they make an account.
- **What syncs:** mood (1–5), current streak, last check-in date, optional status.
  Nothing else — and never journal text.
- **Refresh, not realtime:** the friends list updates on load and when you press the
  refresh button. (Supabase Realtime could make it live later.)
- **Free tier** is plenty for friends-and-family use. If a project is paused for
  inactivity, opening the dashboard resumes it.
- **Desktop app:** Friends targets the web build (https on Vercel). The macOS
  wrapper serves over a custom scheme and may need extra config to reach Supabase;
  it isn't required for the website.

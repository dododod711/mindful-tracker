# Lumen — Mental Health Tracker

A quiet, private place for your mind. Lumen is a daily mental-health companion that
runs entirely in your browser — no account, no build step, nothing to install. Check
in with how you feel, journal, watch your patterns, talk to a supportive on-device
assistant, and (optionally) stay connected with a few people you trust.

Your check-ins and journal live in your browser and never leave your device. The one
opt-in exception is **Friends**, described below.

## Features

### Check-in & journal
- **Daily check-in** — mood on a 1–5 scale (color-coded **red → green**), plus sleep,
  energy, stress, activity tags, and an optional note. One check-in per day.
- **Edit any day** — every saved check-in can be edited or deleted, not just today's.
- **Journal** — freeform entries any time, with gentle, mood-aware writing prompts.
- **Speech-to-text** — dictate journal entries and assistant messages (Web Speech API).

### Insights
- **7-day mood chart** with color-coded bars, plus averages, check-in count, and streak.
- **What we're noticing** — patterns from your own data (e.g. which activities line up
  with better or worse mood).
- **Patterns in your words** — connects journal themes with the mood you logged the same day.

### On-device assistant
A supportive companion that reflects on your last week of check-ins and journal entries.
It runs **entirely in the browser** — no account, no API key, and nothing you write ever
leaves the device.

### Calming resources
Box-breathing pacer, 5-4-3-2-1 grounding, "3 good things", a "kinder thought" reframer,
and crisis info (in the US, call or text **988**).

### Reflection extras
- **On this day** — quietly resurfaces a past journal entry.
- **Letters to your future self** — write a note that stays sealed until a date you choose.

### Stargaze
A breathing planet of stars built from your notes that you can steer with your hand
(camera + MediaPipe) or your cursor — a moment to slow down and reset.

### Friends (opt-in)
Share **only your mood, streak and last check-in** with people you approve, and send
each other encouragement. Friend requests, acceptances, moods and encouragements update
**live** (Supabase Realtime — no refresh needed). You can also **continue as a guest**:
explore everything on-device, with connecting locked until you sign in. Your **journal
and notes never sync** — see [FRIENDS_SETUP.md](FRIENDS_SETUP.md) to switch it on.

### Made to feel like an app
Installable **PWA** that works offline, a WebGL "iridescence" background, a custom
line-icon set and gradient-orb logo, light/dark themes, and an optional guided tour on
a first visit.

## Privacy

- Check-ins, journal, letters, and resource data are stored in your browser's
  `localStorage` and never leave your device.
- The assistant is fully on-device — no network calls, no third parties.
- **Friends** is the only feature that syncs anything, and only when you opt in by
  signing in. It shares your mood (1–5), streak, last check-in date, and an optional
  short status with friends who have accepted you — enforced by row-level security in
  the database. It never syncs journal text, notes, or your sleep/energy/stress numbers.
- **Backup** — export all your data as a JSON file and import it on another device or
  after clearing your browser (on the Check-in page).

## Tech & architecture

- **Plain static HTML/CSS/JS** — no framework, no bundler, no build step.
- **`localStorage`** for all personal data; a **service worker** (`sw.js`, network-first
  with a versioned cache) makes it installable and offline-capable.
- **Supabase** (Postgres + Auth + Row-Level Security + Realtime) powers the optional
  Friends backend, accessed straight from the browser. With no keys configured, Friends
  simply stays off and the rest of the app works fully.
- A thin **macOS WebKit wrapper** (`desktop/`) packages the same web app as a native
  `.app`.

## Running it

**Web** — it's static files. For full PWA/offline behavior, serve over http(s) rather
than opening `file://`:

```bash
# any static server works
python3 -m http.server 8000   # then open http://localhost:8000
```

Or deploy the folder to any static host (Vercel, GitHub Pages, Netlify, …).

**Friends backend (optional)** — follow [FRIENDS_SETUP.md](FRIENDS_SETUP.md) to create a
free Supabase project, run [`supabase-schema.sql`](supabase-schema.sql), and paste two
public values into [`config.js`](config.js). ~3 minutes.

**macOS desktop app** —

```bash
bash desktop/build.sh        # -> desktop/dist/Lumen.app
open desktop/dist/Lumen.app
```

## Project structure

| Path | What it is |
| --- | --- |
| `index.html` | Home |
| `today.html` | Check-in & Journal |
| `insights.html` | Trends, assistant, resources |
| `friends.html` | Friends (opt-in) |
| `galaxy.html` | Stargaze |
| `app.js` | Core logic: check-ins, journal, insights, assistant, resources, reflection features |
| `friends.js` | Friends client: auth, requests, encouragements, Realtime, guest mode |
| `galaxy.js`, `handtracking.js` | Stargaze scene + MediaPipe hand tracking |
| `iridescence.js` | WebGL background |
| `tour.js` | First-visit guided tour |
| `ui.js` | Small UI helpers (scroll reveals, etc.) |
| `styles.css`, `galaxy.css` | Styles |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | PWA: service worker, manifest, logo/favicon |
| `config.js` | Supabase keys for Friends (blank = Friends off) |
| `supabase-schema.sql` | Friends database schema (tables, RLS, RPCs, Realtime) |
| `FRIENDS_SETUP.md` | Friends backend setup guide |
| `desktop/` | macOS WebKit wrapper (`build.sh`, `main.swift`, `makeicon.swift`) |

## License

Released under the [MIT License](LICENSE).

## Disclaimer

Lumen is for **educational and self-reflection purposes only** — its trends, stats, and
assistant responses are simple estimates, not a diagnosis, and not a substitute for
professional care. If you're struggling, please reach out to a qualified professional.
In the US, you can call or text **988** any time.

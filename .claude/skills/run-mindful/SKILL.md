---
name: run-mindful
description: Build, launch, screenshot, and drive the Mindful mental health tracker (mentaltracker) — a static HTML/CSS/JS web app with a macOS WebKit wrapper. Use when asked to run, start, build, screenshot, smoke-test, or drive the Mindful / mental health tracker / stargaze app.
---

# Run Mindful

Mindful is a static **HTML/CSS/JS** app (`Mental Health Tracker/`) with a thin
**macOS WebKit wrapper** (`desktop/`). There is no bundler and no Node — pages
are plain `<script>`/`<link>` files served over a custom `mindful://` scheme so
`localStorage`, the service worker, and relative fetches behave like real https.

The agent driver is **`.claude/skills/run-mindful/driver.swift`** — a headless
`WKWebView` harness (the same engine the shipped app uses, since there is no
Chromium/Node here). It serves the web source and can **screenshot any page**
or **run JS** against it, without building the `.app`.

Pages: `index.html` (Home), `today.html` (Check-in + Journal), `insights.html`
(Trends + Assistant + Resources), `galaxy.html` (Stargaze).

All paths below are relative to the unit root (`mentaltracker/`).

## Prerequisites

macOS with the Xcode Command Line Tools (provides `swiftc`/`swift`, and
`sips`/`iconutil` for the app icon). Nothing else — no Node, no Chromium.

```bash
swift --version          # Apple Swift 6.x; install via: xcode-select --install
```

## Run — agent path (driver)

Drive the web UI directly from source (no build needed). Screenshots land
wherever you point them (e.g. `/tmp`):

```bash
# Screenshot a page. The trailing JS runs first — here it forces the
# scroll-reveal elements visible (see Gotchas), then sizes the viewport.
swift .claude/skills/run-mindful/driver.swift shot index.html /tmp/run-home.png \
  'document.querySelectorAll(".reveal").forEach(e=>e.classList.add("visible"));' 980 760

# Stargaze is a <canvas> scene behind an intro overlay — dismiss it to see the planet.
swift .claude/skills/run-mindful/driver.swift shot galaxy.html /tmp/run-planet.png \
  'document.getElementById("intro").hidden=true;'

# Run JS and read a value back (prints "RESULT: ...").
swift .claude/skills/run-mindful/driver.swift eval today.html 'return document.title;'

# Seed data + re-render, then assert on the DOM (storage writes wrapped — see Gotchas).
swift .claude/skills/run-mindful/driver.swift eval index.html \
  'try{localStorage.setItem("mindful-entries","[]");}catch(e){} render();
   const b=document.getElementById("streak-banner");
   return "hidden="+b.hidden+" display="+getComputedStyle(b).display;'
```

`WEB_ROOT=/some/dir` overrides which folder pages are served from (default: the
`Mental Health Tracker/` source next to this skill).

## Build + smoke-test the macOS app

```bash
bash desktop/build.sh        # -> desktop/dist/Mindful.app  (prints "Built ...")

# Headless smoke test: loads each page in the built app, checks storage + JS errors.
for p in index today insights galaxy; do
  printf "%-9s " "$p:"; ./desktop/dist/Mindful.app/Contents/MacOS/Mindful --selftest --page $p.html
done
# Each prints e.g.:  storage=ok title=... sections=3 cards=3 media=true jserr=none
# jserr=none is the pass signal. (galaxy reports sections=0 cards=0 — expected, it's a canvas page.)
```

## Run — human path

```bash
open desktop/dist/Mindful.app   # opens the real app window; useless over headless/SSH
```

## Gotchas

- **No Node/Chromium on this box** — that's why the driver is Swift/WKWebView,
  not Playwright. WKWebView is the same engine the app ships with.
- **Custom scheme, not `file://`** — pages are served over `mindful://`. Opening
  the raw `.html` via `file://` breaks the service worker and some relative loads.
- **Scroll-reveal hides content in one-shot renders.** Most content has class
  `reveal` (opacity:0 until an IntersectionObserver fires). Headless, the
  observer often doesn't fire, so screenshots look empty. Force it in the shot
  JS: `document.querySelectorAll(".reveal").forEach(e=>e.classList.add("visible"))`.
  The canvas page (`galaxy.html`) doesn't use reveals.
- **`localStorage.clear()` can throw** in the harness and abort your JS. Wrap
  storage writes: `try{ localStorage.setItem(...) }catch(e){}`.
- **`galaxy.html` opens behind an intro overlay** (`#intro`). Dismiss it with
  `document.getElementById("intro").hidden=true;` to render the planet. The
  canvas animates itself via `requestAnimationFrame`; the driver's ~1.4s settle
  is plenty of frames — no need to call `frame()` manually.
- **Camera + assistant can't run headless.** Hand tracking uses `getUserMedia` +
  MediaPipe from a CDN; the Gemini assistant needs a user-supplied API key.
  Neither is exercisable here (no camera, key, or — offline — network). The
  driver covers the DOM/UI layer; with no camera the scene falls back to cursor
  control. (MediaPipe *does* initialize inside WKWebView when online.)
- **The source folder name has a space** (`Mental Health Tracker/`). `driver.swift`
  and `desktop/build.sh` quote it; keep the quotes if you script around them.
- **macOS only.** The wrapper uses AppKit/WebKit/`swiftc` and won't build on
  Linux. The web app itself is portable static files.

## Troubleshooting

- `swift: command not found` → install the Xcode CLT: `xcode-select --install`.
- **Blank/empty screenshot** → reveals weren't forced; add the
  `.reveal → .visible` JS (see Gotchas). For `galaxy.html`, dismiss `#intro`.
- **`open desktop/dist/Mindful.app` shows nothing** → it's a GUI launch; over
  headless/SSH use the driver or `--selftest` instead.
- Editing `driver.swift`: `mode`, `page`, `arg3`, `shotJS` are **top-level
  globals**, not members of `Delegate` — reference them directly (no `self.`).

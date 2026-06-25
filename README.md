# Lumen — Mental Health Tracker

A free, no-account daily mental health check-in that runs entirely in the browser.

## Features

- **Daily check-in** — mood (1–5), sleep, energy, stress, activity tags, and an optional note. One check-in per day; re-saving updates it.
- **Journal** — freeform entries any time, shown alongside check-ins. Each entry can be deleted individually.
- **Trends** — a 7-day mood chart plus averages, total check-ins, and a daily streak.
- **AI assistant (optional)** — a supportive chat powered by Google Gemini. Visitors bring their own free API key from [Google AI Studio](https://aistudio.google.com/app/apikey); the key is stored only in their browser.
- **Backup** — export all data as a JSON file and import it on another device or after clearing the browser.

## Running it

No build step or server needed — open `index.html` in a browser, or serve the folder with any static host (GitHub Pages works).

## Privacy

All check-ins and journal entries live in the browser's localStorage and never leave the device, with one exception: chatting with the assistant sends those messages (plus a short summary of recent check-ins) directly to Google's Gemini API.

## Disclaimer

For educational and self-reflection purposes only — not medical advice or a substitute for professional care. If you're struggling, in the US you can call or text **988** any time.

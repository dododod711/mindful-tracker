// ===== Mindful — Mental Health Tracker =====
// All data is stored locally in the browser via localStorage.

const STORAGE_KEY = "mindful-entries";
const JOURNAL_KEY = "mindful-journal";
const MOOD_EMOJI = { 1: "😞", 2: "😕", 3: "😐", 4: "🙂", 5: "😄" };

// ---- Storage helpers ----
function loadFrom(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

const loadEntries = () => loadFrom(STORAGE_KEY);
const loadNotes = () => loadFrom(JOURNAL_KEY);

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function saveNotes(notes) {
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(notes));
}

function todayKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  // Build YYYY-MM-DD from local time — toISOString() is UTC and would
  // file evening check-ins under the next day.
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---- Live slider outputs ----
for (const id of ["sleep", "energy", "stress"]) {
  const input = document.getElementById(id);
  const out = document.getElementById(`${id}-out`);
  input.addEventListener("input", () => (out.value = input.value));
}

// ---- Check-in form ----
const form = document.getElementById("checkin-form");
const saveMsg = document.getElementById("save-msg");

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = new FormData(form);

  const entry = {
    date: todayKey(),
    mood: Number(data.get("mood")),
    sleep: Number(data.get("sleep")),
    energy: Number(data.get("energy")),
    stress: Number(data.get("stress")),
    tags: data.getAll("tags"),
    note: data.get("note").trim(),
  };

  // One entry per day — replace today's if it exists.
  const entries = loadEntries().filter((en) => en.date !== entry.date);
  entries.push(entry);
  entries.sort((a, b) => b.date.localeCompare(a.date));
  saveEntries(entries);

  saveMsg.hidden = false;
  setTimeout(() => (saveMsg.hidden = true), 3000);
  render();
});

// ---- Journal composer ----
const composer = document.getElementById("composer");
const composerText = document.getElementById("journal-text");
const newEntryBtn = document.getElementById("new-entry-btn");

newEntryBtn.addEventListener("click", () => {
  composer.hidden = !composer.hidden;
  if (!composer.hidden) composerText.focus();
});

document.getElementById("composer-cancel").addEventListener("click", () => {
  composer.hidden = true;
  composerText.value = "";
});

document.getElementById("composer-save").addEventListener("click", () => {
  const text = composerText.value.trim();
  if (!text) {
    composerText.focus();
    return;
  }

  const notes = loadNotes();
  notes.push({ id: Date.now(), ts: new Date().toISOString(), text });
  saveNotes(notes);

  composerText.value = "";
  composer.hidden = true;
  render();
});

// ---- Backup: export / import ----
document.getElementById("export-data").addEventListener("click", () => {
  const data = { entries: loadEntries(), journal: loadNotes() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `mindful-backup-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

const importFile = document.getElementById("import-file");

document.getElementById("import-data").addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    const entries = Array.isArray(data.entries) ? data.entries : [];
    const journal = Array.isArray(data.journal) ? data.journal : [];
    if (!entries.length && !journal.length) throw new Error("empty");

    // Merge with what's already here; the backup wins on conflicts.
    const byDate = new Map(loadEntries().map((en) => [en.date, en]));
    for (const en of entries) if (en && en.date) byDate.set(en.date, en);
    saveEntries([...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)));

    const byId = new Map(loadNotes().map((n) => [n.id, n]));
    for (const n of journal) if (n && n.id) byId.set(n.id, n);
    saveNotes([...byId.values()]);

    render();
    alert("Backup imported.");
  } catch {
    alert("That file doesn't look like a Mindful backup.");
  }
  importFile.value = "";
});

// ---- Clear data ----
document.getElementById("clear-data").addEventListener("click", () => {
  if (confirm("Delete all saved check-ins and journal entries? This can't be undone.")) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(JOURNAL_KEY);
    render();
  }
});

// ---- Rendering ----
function render() {
  const entries = loadEntries();
  renderChart(entries);
  renderStats(entries);
  renderJournal(entries);
  renderStreakBanner(entries);
  updateCheckinButton(entries);
}

function updateCheckinButton(entries) {
  const hasToday = entries.some((en) => en.date === todayKey());
  form.querySelector('button[type="submit"]').textContent = hasToday
    ? "Update today's check-in"
    : "Save today's check-in";
}

// Pre-fill the form with today's check-in so updating doesn't start from
// scratch. Called once on load only — never during render, so it can't
// clobber edits in progress.
function prefillCheckinForm() {
  const today = loadEntries().find((en) => en.date === todayKey());
  if (!today) return;

  const moodInput = form.querySelector(`input[name="mood"][value="${today.mood}"]`);
  if (moodInput) moodInput.checked = true;

  for (const id of ["sleep", "energy", "stress"]) {
    document.getElementById(id).value = today[id];
    document.getElementById(`${id}-out`).value = today[id];
  }

  for (const box of form.querySelectorAll('input[name="tags"]')) {
    box.checked = today.tags.includes(box.value);
  }

  document.getElementById("note").value = today.note;
}

function renderChart(entries) {
  const chart = document.getElementById("mood-chart");
  chart.innerHTML = "";
  const byDate = Object.fromEntries(entries.map((en) => [en.date, en]));

  for (let i = 6; i >= 0; i--) {
    const key = todayKey(i);
    const entry = byDate[key];
    const day = new Date(key + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "short",
    });

    const col = document.createElement("div");
    col.className = "chart-col";

    const emoji = document.createElement("span");
    emoji.className = "chart-emoji";
    emoji.textContent = entry ? MOOD_EMOJI[entry.mood] : "·";

    const bar = document.createElement("div");
    bar.className = "chart-bar" + (entry ? "" : " empty");
    bar.style.height = entry ? `${entry.mood * 20}%` : "4px";
    bar.title = entry ? `${key}: mood ${entry.mood}/5` : `${key}: no entry`;

    const label = document.createElement("span");
    label.className = "chart-day";
    label.textContent = i === 0 ? "Today" : day;

    col.append(emoji, bar, label);
    chart.appendChild(col);
  }
}

function renderStats(entries) {
  const last7 = entries.filter((en) => en.date >= todayKey(6));
  const avg = (arr) =>
    arr.length ? (arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1) : "–";

  document.getElementById("stat-avg-mood").textContent = avg(last7.map((e) => e.mood));
  document.getElementById("stat-avg-sleep").textContent =
    last7.length ? `${avg(last7.map((e) => e.sleep))}h` : "–";
  document.getElementById("stat-entries").textContent = entries.length;
  document.getElementById("stat-streak").textContent = currentStreak(entries);
}

function currentStreak(entries) {
  const dates = new Set(entries.map((en) => en.date));
  let streak = 0;
  // A streak can start today or yesterday (today's check-in may not be done yet).
  let offset = dates.has(todayKey()) ? 0 : 1;
  while (dates.has(todayKey(offset))) {
    streak++;
    offset++;
  }
  return streak;
}

function renderStreakBanner(entries) {
  const banner = document.getElementById("streak-banner");
  const streak = currentStreak(entries);
  banner.hidden = streak < 2;
  banner.textContent = `🔥 ${streak}-day check-in streak`;
}

function renderJournal(entries) {
  const list = document.getElementById("entries");
  const notes = loadNotes();
  list.innerHTML = "";

  const hasData = entries.length > 0 || notes.length > 0;
  document.getElementById("clear-data").hidden = !hasData;
  document.getElementById("export-data").hidden = !hasData;

  // Merge check-ins and written entries, newest first.
  const items = [
    ...entries.map((en) => ({ kind: "checkin", sort: `${en.date}T12:00:00`, en })),
    ...notes.map((n) => ({ kind: "note", sort: n.ts, n })),
  ].sort((a, b) => b.sort.localeCompare(a.sort));

  if (items.length === 0) {
    list.innerHTML =
      '<p class="empty-state">No entries yet — your saved check-ins will appear here.</p>';
    return;
  }

  for (const item of items) {
    const el = document.createElement("article");
    el.className = "entry";

    if (item.kind === "checkin") {
      const entry = item.en;
      const date = new Date(entry.date + "T12:00:00").toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });

      const tagsHtml = entry.tags
        .map((t) => `<span class="entry-tag">${t}</span>`)
        .join("");

      el.innerHTML = `
        <div class="entry-head">
          <span class="entry-mood">${MOOD_EMOJI[entry.mood]}</span>
          <span class="entry-date">${date}</span>
          <span class="entry-meta">😴 ${entry.sleep}h · ⚡ ${entry.energy}/10 · 😣 ${entry.stress}/10 · <button class="entry-delete" data-date="${entry.date}">delete</button></span>
        </div>
        ${tagsHtml ? `<div class="entry-tags">${tagsHtml}</div>` : ""}
        ${entry.note ? `<p class="entry-note"></p>` : ""}
      `;

      // Insert the note as text (not HTML) so user input is never interpreted as markup.
      if (entry.note) el.querySelector(".entry-note").textContent = entry.note;
    } else {
      const note = item.n;
      const when = new Date(note.ts).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
      const time = new Date(note.ts).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });

      el.innerHTML = `
        <div class="entry-head">
          <span class="entry-mood">📝</span>
          <span class="entry-date">${when}</span>
          <span class="entry-meta">${time} · <button class="entry-delete" data-id="${note.id}">delete</button></span>
        </div>
        <p class="entry-note"></p>
      `;

      el.querySelector(".entry-note").textContent = note.text;
    }

    list.appendChild(el);
  }
}

// Delete a check-in or written journal entry (event delegation, since entries re-render).
document.getElementById("entries").addEventListener("click", (e) => {
  const btn = e.target.closest(".entry-delete");
  if (!btn) return;

  if (btn.dataset.date) {
    // Check-ins are keyed by date (one per day).
    if (confirm("Delete this check-in? It will also be removed from your trends.")) {
      saveEntries(loadEntries().filter((en) => en.date !== btn.dataset.date));
      render();
    }
  } else if (confirm("Delete this journal entry?")) {
    saveNotes(loadNotes().filter((n) => n.id !== Number(btn.dataset.id)));
    render();
  }
});

prefillCheckinForm();
render();

// ---- AI Assistant (Gemini — bring your own key) ----
// The key is stored only in this browser's localStorage and sent directly
// to Google's API; there is no middleman server. Chats are session-only.
const GEMINI_KEY = "mindful-gemini-key";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const setupPanel = document.getElementById("assistant-setup");
const chatPanel = document.getElementById("assistant-chat");
const chatMessages = document.getElementById("chat-messages");
const chatHistory = []; // session only — not persisted

function renderAssistant() {
  const hasKey = Boolean(localStorage.getItem(GEMINI_KEY));
  setupPanel.hidden = hasKey;
  chatPanel.hidden = !hasKey;
}

document.getElementById("save-key").addEventListener("click", () => {
  const keyInput = document.getElementById("gemini-key");
  const key = keyInput.value.trim();
  if (!key) {
    keyInput.focus();
    return;
  }
  localStorage.setItem(GEMINI_KEY, key);
  keyInput.value = "";
  renderAssistant();
});

document.getElementById("remove-key").addEventListener("click", () => {
  localStorage.removeItem(GEMINI_KEY);
  renderAssistant();
});

function addBubble(role, text) {
  const div = document.createElement("div");
  div.className = `chat-bubble ${role}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

function assistantSystemPrompt() {
  const last7 = loadEntries().filter((en) => en.date >= todayKey(6));
  const summary = last7
    .map(
      (en) =>
        `${en.date}: mood ${en.mood}/5, sleep ${en.sleep}h, energy ${en.energy}/10, stress ${en.stress}/10` +
        (en.tags.length ? `, did: ${en.tags.join(", ")}` : "")
    )
    .join("\n");

  return [
    "You are the supportive companion inside Mindful, a personal mental health check-in website.",
    "Be warm, brief (2–4 sentences), and encouraging. Listen first; offer at most one gentle, practical suggestion.",
    "You are not a therapist and must not diagnose or give medical advice. If the user mentions self-harm, suicide, or crisis, gently urge them to call or text 988 (US) or contact local emergency services.",
    summary
      ? `The user's check-ins from the last 7 days:\n${summary}`
      : "The user has no recent check-ins.",
  ].join("\n\n");
}

document.getElementById("chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  const sendBtn = e.target.querySelector('button[type="submit"]');
  const text = input.value.trim();
  if (!text || sendBtn.disabled) return;

  sendBtn.disabled = true;
  input.value = "";
  addBubble("user", text);
  chatHistory.push({ role: "user", parts: [{ text }] });
  const pending = addBubble("assistant", "…");

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": localStorage.getItem(GEMINI_KEY),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: assistantSystemPrompt() }] },
        contents: chatHistory,
      }),
    });

    if (!res.ok) {
      throw new Error(
        res.status === 400 || res.status === 403
          ? "That key didn't work — try removing it and saving a new one."
          : `The assistant hit an error (${res.status}). Try again in a moment.`
      );
    }

    const data = await res.json();
    const reply =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
      "Sorry — I couldn't come up with a response. Try again?";
    pending.textContent = reply;
    chatHistory.push({ role: "model", parts: [{ text: reply }] });
  } catch (err) {
    pending.textContent =
      err instanceof TypeError
        ? "Network error — check your connection and try again."
        : err.message;
    pending.classList.add("error");
    chatHistory.pop(); // drop the failed turn so retries start clean
  }
  sendBtn.disabled = false;
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

renderAssistant();

// ---- Scroll transitions ----
// Sections slide in when they enter the viewport and slide back out
// when they leave, each in the direction set by their reveal-* class.
const revealObserver = new IntersectionObserver(
  (observed) => {
    for (const { target, isIntersecting } of observed) {
      target.classList.toggle("visible", isIntersecting);
    }
  },
  { threshold: 0.15 }
);

document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

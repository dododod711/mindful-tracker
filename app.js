// ===== Lumen — Mental Health Tracker =====
// All data is stored locally in the browser via localStorage.
//
// This script loads on both pages (Check-in/Journal and Insights). The two
// share storage but not markup, so every DOM lookup is guarded — a feature
// only wires itself up when its elements are present on the current page.

const STORAGE_KEY = "mindful-entries";
const JOURNAL_KEY = "mindful-journal";
// Custom line-icon mood faces (sad → happy), drawn with the shared .ic class.
const MOOD_MOUTHS = {
  1: "M8 16 Q12 13 16 16",
  2: "M8.5 15.5 Q12 14 15.5 15.5",
  3: "M8.5 15 H15.5",
  4: "M8.5 14.5 Q12 16 15.5 14.5",
  5: "M8 14 Q12 17 16 14",
};
const moodFace = (n) =>
  `<svg class="ic mood-c${n}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9 10v.01M15 10v.01"/><path d="${MOOD_MOUTHS[n]}"/></svg>`;

// Small inline icons for the entry meta line.
const ICON = {
  sleep: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4 6.3 6.3 0 0 0 20 14.5z"/></svg>',
  energy: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  stress: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2-6 4 12 2-6h6"/></svg>',
  streak: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3 4 6 6 6 10a6 6 0 0 1-12 0c0-1.8.8-3 2-4 .3 1.4 1 2 2 2 0-2.5-1-4 2-8z"/></svg>',
  note: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 16h4"/></svg>',
  letterOpen: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10l9-6 9 6v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10l9 6 9-6"/></svg>',
  lock: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
};

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

// ---- Live slider outputs (check-in page) ----
for (const id of ["sleep", "energy", "stress"]) {
  const input = document.getElementById(id);
  const out = document.getElementById(`${id}-out`);
  if (input && out) input.addEventListener("input", () => (out.value = input.value));
}

// ---- Check-in form (check-in page) ----
const form = document.getElementById("checkin-form");
const saveMsg = document.getElementById("save-msg");
let editingDate = null; // when set, the form edits that day's check-in instead of today's

if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const targetDate = editingDate || todayKey();

    const entry = {
      date: targetDate,
      mood: Number(data.get("mood")),
      sleep: Number(data.get("sleep")),
      energy: Number(data.get("energy")),
      stress: Number(data.get("stress")),
      tags: data.getAll("tags"),
      note: data.get("note").trim(),
    };

    // One entry per day — replace that day's if it exists.
    const entries = loadEntries().filter((en) => en.date !== targetDate);
    entries.push(entry);
    entries.sort((a, b) => b.date.localeCompare(a.date));
    saveEntries(entries);

    if (editingDate) exitEditMode();

    if (saveMsg) {
      saveMsg.hidden = false;
      setTimeout(() => (saveMsg.hidden = true), 3000);
    }
    render();
    // If Friends is on and signed in, push the new mood/streak (no-op otherwise).
    if (window.LumenSync) window.LumenSync.pushState();
  });

  const cancelEditBtn = document.getElementById("cancel-edit");
  if (cancelEditBtn) cancelEditBtn.addEventListener("click", () => exitEditMode());
}

// ---- Journal composer (check-in page) ----
const composer = document.getElementById("composer");
const composerText = document.getElementById("journal-text");
const newEntryBtn = document.getElementById("new-entry-btn");

if (composer && composerText && newEntryBtn) {
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
}

// ---- Backup: export / import (check-in page) ----
const exportBtn = document.getElementById("export-data");
if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    const data = { entries: loadEntries(), journal: loadNotes() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mindful-backup-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

const importFile = document.getElementById("import-file");
const importBtn = document.getElementById("import-data");

if (importBtn && importFile) {
  importBtn.addEventListener("click", () => importFile.click());

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
      alert("That file doesn't look like a Lumen backup.");
    }
    importFile.value = "";
  });
}

// ---- Clear data (check-in page) ----
const clearBtn = document.getElementById("clear-data");
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    if (confirm("Delete all saved check-ins and journal entries? This can't be undone.")) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(JOURNAL_KEY);
      render();
    }
  });
}

// ---- Rendering ----
// Each renderer is a no-op on pages where its target elements are absent,
// so render() can be called from either page.
function render() {
  const entries = loadEntries();
  renderChart(entries);
  renderStats(entries);
  renderInsights(entries);
  renderJournal(entries);
  renderStreakBanner(entries);
  updateCheckinButton(entries);
  renderOnThisDay();
  renderLetters();
  renderWordPatterns(entries);
}

// ---- Patterns: plain-language observations from the check-in data ----
const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);

// Pearson correlation, or 0 when there isn't enough spread to be meaningful.
function correlation(xs, ys) {
  const n = xs.length;
  if (n < 4) return 0;
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

const TAG_LIST = ["Exercise", "Friends", "Outdoors", "Work/School", "Good meal", "Screen time"];

function renderInsights(entries) {
  const list = document.getElementById("insights-list");
  if (!list) return;

  if (entries.length < 4) {
    list.innerHTML =
      '<li class="insight-empty">Keep checking in — patterns will appear here once there are about four days to compare.</li>';
    return;
  }

  const found = [];

  // Which activity tags line up with better or worse mood?
  let bestTag = null, worstTag = null;
  for (const tag of TAG_LIST) {
    const withTag = entries.filter((e) => (e.tags || []).includes(tag));
    const without = entries.filter((e) => !(e.tags || []).includes(tag));
    if (withTag.length < 2 || without.length < 2) continue;
    const delta = mean(withTag.map((e) => e.mood)) - mean(without.map((e) => e.mood));
    if (!bestTag || delta > bestTag.delta) bestTag = { tag, delta, withTag, without };
    if (!worstTag || delta < worstTag.delta) worstTag = { tag, delta, withTag, without };
  }
  if (bestTag && bestTag.delta >= 0.4) {
    found.push(
      `On days you log <strong>${bestTag.tag}</strong>, your mood averages ` +
        `${mean(bestTag.withTag.map((e) => e.mood)).toFixed(1)} vs ` +
        `${mean(bestTag.without.map((e) => e.mood)).toFixed(1)} otherwise ` +
        `(+${bestTag.delta.toFixed(1)}).`
    );
  }
  if (worstTag && worstTag.delta <= -0.4 && worstTag.tag !== (bestTag && bestTag.tag)) {
    found.push(
      `Your mood tends to dip on <strong>${worstTag.tag}</strong> days ` +
        `(${worstTag.delta.toFixed(1)} vs other days).`
    );
  }

  // Sleep, stress and energy versus mood.
  const sleepR = correlation(entries.map((e) => e.sleep), entries.map((e) => e.mood));
  if (sleepR >= 0.3) found.push("More sleep tends to go with a better mood for you.");
  else if (sleepR <= -0.3) found.push("Interestingly, more sleep hasn't lined up with better mood lately.");

  const stressR = correlation(entries.map((e) => e.stress), entries.map((e) => e.mood));
  if (stressR <= -0.3) found.push("Higher-stress days usually come with a lower mood — worth protecting your calm.");

  const energyR = correlation(entries.map((e) => e.energy), entries.map((e) => e.mood));
  if (energyR >= 0.4) found.push("Your mood and energy rise and fall together.");

  // Best day of the week, if there's enough spread.
  const byDow = Array.from({ length: 7 }, () => []);
  for (const e of entries) byDow[new Date(e.date + "T12:00:00").getDay()].push(e.mood);
  const dows = byDow
    .map((moods, d) => ({ d, n: moods.length, m: mean(moods) }))
    .filter((x) => x.n >= 2);
  if (dows.length >= 3) {
    const best = dows.reduce((a, b) => (b.m > a.m ? b : a));
    const days = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
    if (best.m - mean(dows.map((x) => x.m)) >= 0.3) {
      found.push(`<strong>${days[best.d]}</strong> are usually your brightest days.`);
    }
  }

  list.innerHTML = found.length
    ? found.map((f) => `<li>${f}</li>`).join("")
    : '<li class="insight-empty">No strong patterns yet — a few more check-ins will sharpen the picture.</li>';
}

function updateCheckinButton(entries) {
  if (!form) return;
  const btn = form.querySelector('button[type="submit"]');
  if (editingDate) {
    btn.textContent = `Update ${friendlyDate(editingDate)} check-in`;
    return;
  }
  const hasToday = entries.some((en) => en.date === todayKey());
  btn.textContent = hasToday ? "Update today's check-in" : "Save today's check-in";
}

// Fill the check-in form from an entry — today's, or a past one being edited.
function fillFormFrom(entry) {
  if (!form || !entry) return;
  const moodInput = form.querySelector(`input[name="mood"][value="${entry.mood}"]`);
  if (moodInput) moodInput.checked = true;

  for (const id of ["sleep", "energy", "stress"]) {
    document.getElementById(id).value = entry[id];
    document.getElementById(`${id}-out`).value = entry[id];
  }

  for (const box of form.querySelectorAll('input[name="tags"]')) {
    box.checked = (entry.tags || []).includes(box.value);
  }

  document.getElementById("note").value = entry.note || "";
}

// Pre-fill the form with today's check-in so updating doesn't start from
// scratch. Called once on load only — never during render, so it can't
// clobber edits in progress.
function prefillCheckinForm() {
  if (!form) return;
  const today = loadEntries().find((en) => en.date === todayKey());
  if (today) fillFormFrom(today);
}

// Reset the form back to "today" mode: HTML defaults, then today's entry if any.
function resetFormToToday() {
  if (!form) return;
  form.reset();
  for (const id of ["sleep", "energy", "stress"]) {
    document.getElementById(`${id}-out`).value = document.getElementById(id).value;
  }
  const today = loadEntries().find((en) => en.date === todayKey());
  if (today) fillFormFrom(today);
}

// Edit a past check-in: load it into the form and mark the form as editing it.
function startEdit(entry) {
  if (!form || !entry) return;
  editingDate = entry.date;
  fillFormFrom(entry);
  const banner = document.getElementById("edit-banner");
  if (banner) {
    banner.textContent = `Editing your check-in for ${friendlyDate(entry.date)}.`;
    banner.hidden = false;
  }
  const cancel = document.getElementById("cancel-edit");
  if (cancel) cancel.hidden = false;
  updateCheckinButton(loadEntries());
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  const checked = form.querySelector('input[name="mood"]:checked');
  if (checked) checked.focus();
}

// Leave edit mode and return the form to today.
function exitEditMode() {
  editingDate = null;
  const banner = document.getElementById("edit-banner");
  if (banner) banner.hidden = true;
  const cancel = document.getElementById("cancel-edit");
  if (cancel) cancel.hidden = true;
  resetFormToToday();
  updateCheckinButton(loadEntries());
}

function renderChart(entries) {
  const chart = document.getElementById("mood-chart");
  if (!chart) return;
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
    if (entry) emoji.innerHTML = moodFace(entry.mood);
    else emoji.textContent = "·";

    const bar = document.createElement("div");
    bar.className = "chart-bar" + (entry ? " mood-c" + entry.mood : " empty");
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
  const avgMoodEl = document.getElementById("stat-avg-mood");
  if (!avgMoodEl) return;

  const last7 = entries.filter((en) => en.date >= todayKey(6));
  const avg = (arr) =>
    arr.length ? (arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1) : "–";

  avgMoodEl.textContent = avg(last7.map((e) => e.mood));
  document.getElementById("stat-avg-sleep").textContent =
    last7.length ? `${avg(last7.map((e) => e.sleep))}h` : "–";
  document.getElementById("stat-entries").textContent = entries.length;
  document.getElementById("stat-streak").textContent = currentStreak(entries);

  const empty = document.getElementById("trends-empty");
  if (empty) empty.hidden = entries.length > 0;
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
  if (!banner) return;
  const streak = currentStreak(entries);
  banner.hidden = streak < 2;
  banner.innerHTML = `${ICON.streak} ${streak}-day check-in streak`;
}

function renderJournal(entries) {
  const list = document.getElementById("entries");
  if (!list) return;
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
          <span class="entry-mood">${moodFace(entry.mood)}</span>
          <span class="entry-date">${date}</span>
          <span class="entry-meta">${ICON.sleep} ${entry.sleep}h · ${ICON.energy} ${entry.energy}/10 · ${ICON.stress} ${entry.stress}/10 · <button class="entry-edit" data-date="${entry.date}">edit</button> · <button class="entry-delete" data-date="${entry.date}">delete</button></span>
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
          <span class="entry-mood">${ICON.note}</span>
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
const entriesList = document.getElementById("entries");
if (entriesList) {
  entriesList.addEventListener("click", (e) => {
    const editBtn = e.target.closest(".entry-edit");
    if (editBtn) {
      const entry = loadEntries().find((en) => en.date === editBtn.dataset.date);
      if (entry) startEdit(entry);
      return;
    }

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
}

prefillCheckinForm();
// Initial render runs at the very end of this file, once every helper
// (including the theme engine below) has been defined.

// ---- On-device assistant (insights page) ----
// A supportive companion that reflects on the last 7 days of journal entries
// and check-ins. Everything runs here in the browser: no API key, no network
// request, and nothing the user writes ever leaves the device.
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const reflectBtn = document.getElementById("reflect-week");
const chatHistory = []; // session only — not persisted

// Themes we can recognise in free-text entries, each with a gentle suggestion.
// Listed in priority order for when several themes show up at once.
const THEMES = [
  { key: "sleep", label: "sleep",
    words: ["sleep", "tired", "exhausted", "insomnia", "awake", "restless", "drained", "fatigue", "nap"],
    tip: "a steadier wind-down — dimming screens and lights about an hour before bed can help rest come easier." },
  { key: "anxiety", label: "anxiety",
    words: ["anxious", "anxiety", "worry", "worried", "nervous", "panic", "scared", "afraid", "racing", "overwhelm", "overwhelmed"],
    tip: "a slow round of box breathing — in for 4, hold 4, out 4, hold 4 — to give a racing mind something steady to hold." },
  { key: "stress", label: "stress",
    words: ["stress", "stressed", "pressure", "deadline", "busy", "swamped", "overworked", "too much"],
    tip: "naming the one thing that matters most today and letting the rest wait — you don't have to carry it all at once." },
  { key: "work", label: "work or study",
    words: ["work", "job", "boss", "meeting", "study", "exam", "test", "school", "class", "homework", "project", "interview", "coworker"],
    tip: "a real break between tasks — even ten minutes away from the screen can reset your focus." },
  { key: "relationships", label: "the people in your life",
    words: ["friend", "family", "partner", "mom", "dad", "argument", "fight", "fought", "breakup", "lonely", "alone", "relationship"],
    tip: "reaching out to one person you trust — even a short message tends to lighten things." },
  { key: "low", label: "a low mood",
    words: ["sad", "down", "depressed", "hopeless", "empty", "cry", "crying", "unmotivated", "numb", "worthless", "miserable"],
    tip: "one small kindness toward yourself — a warm drink, a short walk, a favourite song — without needing to fix everything." },
  { key: "anger", label: "frustration",
    words: ["angry", "mad", "frustrated", "annoyed", "irritated", "furious", "rage"],
    tip: "letting the feeling settle before acting on it — a few minutes and some slow breaths can change the response." },
  { key: "gratitude", label: "the good moments",
    words: ["grateful", "thankful", "happy", "glad", "proud", "excited", "enjoyed", "accomplished", "relaxed", "calm", "love"],
    tip: "pausing to savour it — noticing what made things good helps those moments stick." },
];

const CRISIS_WORDS = ["suicide", "suicidal", "kill myself", "want to die", "don't want to live", "dont want to live", "end it all", "hurt myself", "self-harm", "self harm", "harm myself"];
const CRISIS_REPLY =
  "I'm really glad you told me, and I'm sorry it's this heavy right now. This is bigger than I can hold for you — please reach out to someone who can: call or text 988 (US, Suicide & Crisis Lifeline) any time, or your local emergency number. You deserve support, and you don't have to face this alone.";

const lower = (s) => (s || "").toLowerCase();
const detectThemes = (text) => THEMES.filter((th) => th.words.some((w) => lower(text).includes(w)));
const hasCrisis = (text) => CRISIS_WORDS.some((w) => lower(text).includes(w));
const avg = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null);

// Journal notes plus any short check-in notes written in the last 7 days.
function recentWriting() {
  const since = todayKey(6);
  const pad = (n) => String(n).padStart(2, "0");
  const dayOf = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const notes = loadNotes()
    .filter((n) => n && n.text && dayOf(n.ts) >= since)
    .map((n) => ({ day: dayOf(n.ts), text: n.text }));
  const checkinNotes = loadEntries()
    .filter((en) => en.date >= since && en.note)
    .map((en) => ({ day: en.date, text: en.note }));
  return [...notes, ...checkinNotes].sort((a, b) => a.day.localeCompare(b.day));
}

// The heart of the feature: advice drawn from the past week's writing + check-ins.
function weeklyAdvice() {
  const entries = loadEntries().filter((en) => en.date >= todayKey(6));
  const writing = recentWriting();

  if (!entries.length && !writing.length) {
    return "I don't see any check-ins or journal entries from the past week yet. Whenever you're ready, write a few lines on the Check-in page — even one sentence — and I'll reflect on it with you here.";
  }

  const counts = {};
  for (const w of writing)
    for (const th of detectThemes(w.text)) counts[th.key] = (counts[th.key] || 0) + 1;
  const ranked = THEMES.filter((th) => counts[th.key]).sort((a, b) => counts[b.key] - counts[a.key]);

  const parts = [];
  if (writing.length)
    parts.push(`You wrote ${writing.length} ${writing.length === 1 ? "entry" : "entries"} this past week — putting things into words is its own small act of care.`);
  else
    parts.push("You've checked in a few times this week — that steady attention to how you're doing matters.");

  const mood = avg(entries.map((e) => e.mood));
  const sleep = avg(entries.map((e) => e.sleep));
  const stress = avg(entries.map((e) => e.stress));
  if (sleep !== null && sleep < 6.5)
    parts.push(`Your sleep has averaged about ${sleep.toFixed(1)} hours — running short across a week tends to make everything feel heavier, so protecting rest is worth it.`);
  else if (stress !== null && stress >= 6.5)
    parts.push(`Your stress has sat high this week (around ${stress.toFixed(1)}/10) — that's a real load to be carrying.`);
  else if (mood !== null && mood >= 4)
    parts.push("Your mood has leaned brighter this week — it's worth noticing what's been going right.");

  if (ranked.length)
    parts.push(`This week, ${ranked[0].label} came up more than once in what you wrote. One small thing that can help: ${ranked[0].tip}`);
  else if (writing.length)
    parts.push("If you'd like, tell me what's weighed on you most this week and we can think it through together.");

  return parts.join(" ");
}

function replyTo(text) {
  if (hasCrisis(text)) return CRISIS_REPLY;
  const themes = detectThemes(text);
  if (themes.length) {
    const th = themes[0];
    if (th.key === "gratitude")
      return "That's really good to hear — those brighter moments matter. It's worth pausing to notice what made it good, so it stays with you a little longer.";
    return `I hear you — that's a real thing to be sitting with. Be gentle with yourself; one thing that sometimes helps is ${th.tip}`;
  }
  const openings = [
    "Thank you for sharing that. What feels like the heaviest part of it right now?",
    "I hear you. If it helps, what would feel like one small step toward feeling a little better today?",
    "That makes sense. Would it help to talk through what's underneath it?",
  ];
  return openings[chatHistory.filter((m) => m.role === "user").length % openings.length];
}

function addBubble(role, text) {
  const div = document.createElement("div");
  div.className = `chat-bubble ${role}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

if (chatMessages && chatForm) {
  // Open with advice grounded in the last week, instead of a static greeting.
  chatMessages.innerHTML = "";
  addBubble("assistant", weeklyAdvice());

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    addBubble("user", text);
    chatHistory.push({ role: "user", text });
    const reply = replyTo(text);
    addBubble("assistant", reply);
    chatHistory.push({ role: "assistant", text: reply });
  });

  if (reflectBtn)
    reflectBtn.addEventListener("click", () => addBubble("assistant", weeklyAdvice()));
}

// ---- Scroll transitions ----
// Sections slide in when they enter the viewport and slide back out
// when they leave, each in the direction set by their reveal-* class.
if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (observed) => {
      for (const { target, isIntersecting } of observed) {
        target.classList.toggle("visible", isIntersecting);
      }
    },
    { threshold: 0.15 }
  );
  document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));
} else {
  // No observer support — reveal everything so content is never stuck hidden.
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("visible"));
}

// ---- Interactive resources (insights page) ----
// Each widget only wires up when its elements are on the current page.

// Box breathing: the orb animation is CSS; here we just narrate the phases.
const breath = document.getElementById("breath");
const breathToggle = document.getElementById("breath-toggle");
if (breath && breathToggle) {
  const breathLabel = document.getElementById("breath-label");
  const phases = ["Breathe in", "Hold", "Breathe out", "Hold"];
  let breathTimer = null;
  breathToggle.addEventListener("click", () => {
    if (breathTimer) {
      clearInterval(breathTimer);
      breathTimer = null;
      breath.classList.remove("running");
      breathLabel.textContent = "Ready";
      breathToggle.textContent = "Start";
      return;
    }
    breath.classList.add("running");
    breathToggle.textContent = "Stop";
    let i = 0;
    breathLabel.textContent = phases[0];
    breathTimer = setInterval(() => {
      i = (i + 1) % phases.length;
      breathLabel.textContent = phases[i];
    }, 4000);
  });
}

// 3 Good Things: saved privately in this browser, one set per day.
const GOOD_KEY = "mindful-good-things";
const goodForm = document.getElementById("good-things");
if (goodForm) {
  const goodSaved = document.getElementById("good-saved");
  const goodList = document.getElementById("good-list");
  const goodInputs = [...goodForm.querySelectorAll("input")];

  const goodToggle = document.getElementById("good-toggle");
  let listShown = false; // saved entries stay hidden until the user asks for them

  // Build the saved list — user text via textContent only. Visibility is
  // controlled by the toggle below, not here.
  function renderGoodList() {
    if (!goodList) return;
    const days = loadFrom(GOOD_KEY)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
    goodList.innerHTML = "";
    for (const g of days) {
      const dayLi = document.createElement("li");
      dayLi.className = "good-day";
      const date = document.createElement("span");
      date.className = "good-date";
      date.textContent =
        g.date === todayKey()
          ? "Today"
          : new Date(g.date + "T12:00:00").toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            });
      const items = document.createElement("ul");
      for (const t of g.items) {
        const itemLi = document.createElement("li");
        itemLi.textContent = t;
        items.appendChild(itemLi);
      }
      dayLi.append(date, items);
      goodList.appendChild(dayLi);
    }
  }

  // Show or hide the "Show saved" button (only useful once something's saved).
  function updateGoodToggle() {
    const has = loadFrom(GOOD_KEY).length > 0;
    if (goodToggle) {
      goodToggle.hidden = !has;
      goodToggle.textContent = listShown ? "Hide saved" : "Show saved";
    }
    if (!has) {
      listShown = false;
      if (goodList) goodList.hidden = true;
    }
  }

  // Drop today's saved entry into the form for editing — only when the user
  // reveals their saved good things, and only if they haven't started typing.
  function prefillTodaysGood() {
    if (!goodInputs.every((el) => !el.value.trim())) return;
    const t = loadFrom(GOOD_KEY).find((g) => g.date === todayKey());
    if (t) t.items.forEach((txt, n) => { if (goodInputs[n]) goodInputs[n].value = txt; });
  }

  if (goodToggle)
    goodToggle.addEventListener("click", () => {
      listShown = !listShown;
      if (listShown) {
        prefillTodaysGood();
        renderGoodList();
        if (goodList) goodList.hidden = false;
      } else if (goodList) {
        goodList.hidden = true;
      }
      updateGoodToggle();
    });

  if (goodList) goodList.hidden = true; // saved entries hidden until requested
  updateGoodToggle();

  goodForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const items = goodInputs.map((el) => el.value.trim()).filter(Boolean);
    if (!items.length) {
      goodInputs[0].focus();
      return;
    }
    const all = loadFrom(GOOD_KEY).filter((g) => g.date !== todayKey());
    all.push({ date: todayKey(), items });
    localStorage.setItem(GOOD_KEY, JSON.stringify(all));
    goodSaved.hidden = false;
    setTimeout(() => (goodSaved.hidden = true), 2500);
    if (listShown) renderGoodList(); // refresh only if it's currently open
    updateGoodToggle();
  });
}

// 5-4-3-2-1 grounding stepper.
const groundBtn = document.getElementById("ground-btn");
if (groundBtn) {
  const groundStep = document.getElementById("ground-step");
  const steps = [
    "Name 5 things you can see",
    "Notice 4 things you can feel",
    "Listen for 3 things you can hear",
    "Find 2 things you can smell",
    "Name 1 thing you can taste",
    "Nicely done — notice how you feel now.",
  ];
  let step = -1;
  groundBtn.addEventListener("click", () => {
    step += 1;
    if (step >= steps.length) {
      step = -1;
      groundStep.textContent = "Tap start, then take your time with each one.";
      groundBtn.textContent = "Start";
      return;
    }
    groundStep.textContent = steps[step];
    groundBtn.textContent = step >= steps.length - 1 ? "Start over" : "Next";
  });
}

// A kinder thought: cycle through gentle, supportive reframes.
const reframeBtn = document.getElementById("reframe-btn");
if (reframeBtn) {
  const reframeText = document.getElementById("reframe-text");
  const thoughts = [
    "Feelings are visitors — they're allowed to come and go.",
    "You've made it through every hard day so far. That's a real track record.",
    "Rest is productive too — you don't have to earn it.",
    "One small step still counts as moving forward.",
    "You can be a work in progress and still be enough right now.",
    "Asking for help is strength, not weakness.",
    "This feeling is real, but it isn't permanent.",
    "Be as kind to yourself as you'd be to a good friend.",
  ];
  let t = 0;
  reframeBtn.addEventListener("click", () => {
    t = (t + 1) % thoughts.length;
    reframeText.textContent = thoughts[t];
  });
}

// =====================================================================
//  Reflection features — what sets Lumen apart from a plain journal:
//  adaptive prompts, "on this day", future-self letters, and patterns
//  that connect your words to your mood. All on-device.
// =====================================================================

// ---- Adaptive journal prompts (check-in page) ----
// The blank page becomes a gentle prompt chosen from the most recent check-in.
const JOURNAL_PROMPTS = {
  low: [
    "What feels heaviest right now — and what would you say to a friend feeling this way?",
    "Name the hardest part of today. What might ease it, even a little?",
    "Where do you feel this in your body? What is it asking for?",
  ],
  stress: [
    "What's one thing in your control today, and one thing you can set down?",
    "Empty your head here — list everything on your mind, no order needed.",
    "If today only had room for one thing, what would matter most?",
  ],
  tired: [
    "What drained you today, and what would real rest look like tonight?",
    "What's one thing you can let be 'good enough' right now?",
    "When did you last feel rested? What was different then?",
  ],
  good: [
    "What went right today? What made it good?",
    "Who or what are you grateful for right now, and why?",
    "Capture this — what would you want to remember about today?",
  ],
  neutral: [
    "What's been on your mind today?",
    "Describe today in three honest sentences.",
    "What's something you're looking forward to, however small?",
    "What did you need today — did you get it?",
  ],
};

function latestEntry() {
  return loadEntries().slice().sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

function promptCategory() {
  const e = latestEntry();
  if (!e) return "neutral";
  if (e.mood <= 2) return "low";
  if (e.stress >= 7) return "stress";
  if (e.energy <= 3) return "tired";
  if (e.mood >= 4) return "good";
  return "neutral";
}

const pickJournalPrompt = () => {
  const arr = JOURNAL_PROMPTS[promptCategory()];
  return arr[Math.floor(Math.random() * arr.length)];
};

const journalPromptEl = document.getElementById("journal-prompt");
if (journalPromptEl && newEntryBtn && composer) {
  const FREEWRITE_KEY = "mindful-freewrite";
  const promptRow = document.getElementById("prompt-row");
  const promptShow = document.getElementById("prompt-show");
  const isFreeWrite = () => {
    try { return localStorage.getItem(FREEWRITE_KEY) === "1"; } catch (e) { return false; }
  };
  const setFreeWrite = (on) => {
    try { on ? localStorage.setItem(FREEWRITE_KEY, "1") : localStorage.removeItem(FREEWRITE_KEY); } catch (e) {}
  };
  const setPrompt = () => (journalPromptEl.textContent = pickJournalPrompt());

  // Show either the prompt or the "free write" state, per the saved preference.
  const applyPromptMode = () => {
    const free = isFreeWrite();
    if (promptRow) promptRow.hidden = free;
    if (promptShow) promptShow.hidden = !free;
    if (!free) setPrompt();
  };
  applyPromptMode();

  newEntryBtn.addEventListener("click", () => {
    if (!composer.hidden) applyPromptMode();
  });

  const shuffle = document.getElementById("prompt-shuffle");
  if (shuffle) shuffle.addEventListener("click", setPrompt);

  const dismiss = document.getElementById("prompt-dismiss");
  if (dismiss)
    dismiss.addEventListener("click", () => {
      setFreeWrite(true);
      applyPromptMode();
      composerText.focus();
    });
  if (promptShow)
    promptShow.addEventListener("click", () => {
      setFreeWrite(false);
      applyPromptMode();
    });

  // Tapping the prompt drops it in as a starting line.
  journalPromptEl.addEventListener("click", () => {
    if (!composer.hidden && !composerText.value.trim()) {
      composerText.value = journalPromptEl.textContent + "\n\n";
      composerText.focus();
    }
  });
}

// ---- Date helpers shared by the reflection features ----
const dayKeyOf = (ts) => {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function daysBetweenTodayAnd(key) {
  const [y, m, d] = key.split("-").map(Number);
  const then = new Date(y, m - 1, d);
  const now = new Date();
  then.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((now - then) / 86400000);
}

function relativeWhen(days) {
  if (days >= 330) return "about a year ago";
  if (days >= 25) return `about ${Math.round(days / 30)} month${days >= 45 ? "s" : ""} ago`;
  if (days >= 13) return `${Math.round(days / 7)} weeks ago`;
  if (days >= 6) return "a week ago";
  return `${days} days ago`;
}

const friendlyDate = (s) => {
  const d = s.length === 10 ? new Date(s + "T12:00:00") : new Date(s);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- "On this day" — resurface a past journal entry (check-in page) ----
function renderOnThisDay() {
  const box = document.getElementById("on-this-day");
  if (!box) return;
  const notes = loadNotes().filter((n) => n && n.text);
  let pick = null;
  // Prefer an entry from a round number of days ago…
  for (const days of [7, 30, 90, 180, 365]) {
    const hit = notes.find((n) => dayKeyOf(n.ts) === todayKey(days));
    if (hit) { pick = { note: hit, days }; break; }
  }
  // …otherwise the oldest entry that's at least a week old.
  if (!pick) {
    const old = notes
      .map((n) => ({ n, days: daysBetweenTodayAnd(dayKeyOf(n.ts)) }))
      .filter((o) => o.days >= 6)
      .sort((a, b) => b.days - a.days)[0];
    if (old) pick = { note: old.n, days: old.days };
  }
  if (!pick) { box.hidden = true; return; }
  box.hidden = false;
  box.querySelector(".otd-when").textContent = relativeWhen(pick.days);
  const t = pick.note.text.replace(/\s+/g, " ").trim();
  box.querySelector(".otd-text").textContent = t.length > 240 ? t.slice(0, 237) + "…" : t;
}

// ---- Letters to your future self (check-in page) ----
const LETTERS_KEY = "mindful-letters";
const loadLetters = () => loadFrom(LETTERS_KEY);
const saveLetters = (ls) => localStorage.setItem(LETTERS_KEY, JSON.stringify(ls));

function renderLetters() {
  const wrap = document.getElementById("letters-list");
  if (!wrap) return;
  const today = todayKey();
  const letters = loadLetters();
  const due = letters.filter((l) => l.deliverOn <= today).sort((a, b) => b.deliverOn.localeCompare(a.deliverOn));
  const sealed = letters.filter((l) => l.deliverOn > today).sort((a, b) => a.deliverOn.localeCompare(b.deliverOn));

  wrap.innerHTML = "";
  for (const l of due) {
    const card = document.createElement("div");
    card.className = "letter-card";
    const meta = document.createElement("p");
    meta.className = "letter-meta";
    meta.innerHTML = `${ICON.letterOpen} A letter you wrote ${friendlyDate(l.created)}`;
    const body = document.createElement("p");
    body.className = "letter-text";
    body.textContent = l.text;
    card.append(meta, body);
    wrap.appendChild(card);
  }
  // Quietly mark delivered letters opened (they stay visible).
  if (due.some((l) => !l.opened)) {
    saveLetters(letters.map((l) => (l.deliverOn <= today ? { ...l, opened: true } : l)));
  }
  const sealedEl = document.getElementById("letters-sealed");
  if (sealedEl) {
    sealedEl.hidden = sealed.length === 0;
    if (sealed.length)
      sealedEl.innerHTML = `${ICON.lock} ${sealed.length} sealed — next opens ${friendlyDate(sealed[0].deliverOn)}.`;
  }
}

const letterToggle = document.getElementById("letter-toggle");
const letterComposer = document.getElementById("letter-composer");
if (letterToggle && letterComposer) {
  const dateInput = document.getElementById("letter-date");
  const textInput = document.getElementById("letter-text");
  if (dateInput) {
    dateInput.min = todayKey(-1); // tomorrow
    dateInput.value = todayKey(-30); // a month out, by default
  }
  letterToggle.addEventListener("click", () => {
    letterComposer.hidden = !letterComposer.hidden;
    if (!letterComposer.hidden && textInput) textInput.focus();
  });
  const cancel = document.getElementById("letter-cancel");
  if (cancel)
    cancel.addEventListener("click", () => {
      letterComposer.hidden = true;
      if (textInput) textInput.value = "";
    });
  const save = document.getElementById("letter-save");
  if (save)
    save.addEventListener("click", () => {
      const text = (textInput.value || "").trim();
      const deliverOn = dateInput.value;
      if (!text) { textInput.focus(); return; }
      if (!deliverOn || deliverOn <= todayKey()) { dateInput.focus(); return; }
      const letters = loadLetters();
      letters.push({ id: Date.now(), created: new Date().toISOString(), deliverOn, text, opened: false });
      saveLetters(letters);
      textInput.value = "";
      letterComposer.hidden = true;
      renderLetters();
      const msg = document.getElementById("letter-saved");
      if (msg) { msg.hidden = false; setTimeout(() => (msg.hidden = true), 3500); }
    });
}

// ---- Mood × theme correlations (insights page) ----
// Joins the words you write with the mood you logged the same day — something
// a plain journal can't do.
function renderWordPatterns(entries) {
  const list = document.getElementById("word-patterns");
  if (!list) return;

  const moodByDay = {};
  for (const e of entries) moodByDay[e.date] = e.mood;
  const overall = avg(entries.map((e) => e.mood));

  const items = [];
  for (const n of loadNotes()) if (n && n.text) items.push({ day: dayKeyOf(n.ts), text: n.text });
  for (const e of entries) if (e.note) items.push({ day: e.date, text: e.note });

  const byTheme = {};
  for (const it of items) {
    for (const th of detectThemes(it.text)) {
      const slot = (byTheme[th.key] ||= { label: th.label, moods: [], count: 0 });
      slot.count += 1;
      if (moodByDay[it.day] != null) slot.moods.push(moodByDay[it.day]);
    }
  }

  const findings = [];
  if (overall != null) {
    const linked = Object.values(byTheme)
      .filter((s) => s.moods.length >= 2)
      .map((s) => ({ ...s, m: avg(s.moods) }))
      .sort((a, b) => Math.abs(b.m - overall) - Math.abs(a.m - overall));
    for (const s of linked.slice(0, 2)) {
      if (Math.abs(s.m - overall) < 0.4) continue;
      const dir = s.m < overall ? "lower" : "brighter";
      findings.push(
        `On days you write about ${s.label}, your mood averages ${s.m.toFixed(1)}/5 — ${dir} than your usual ${overall.toFixed(1)}/5.`
      );
    }
  }
  const top = Object.values(byTheme).sort((a, b) => b.count - a.count)[0];
  if (top && top.count >= 3)
    findings.push(`${capitalize(top.label)} comes up most in your writing — ${top.count} times.`);

  list.innerHTML = findings.length
    ? findings.map((f) => `<li>${f}</li>`).join("")
    : '<li class="insight-empty">Journal a few times and check in alongside — Lumen will start to notice how your words and your mood connect.</li>';
}

// ---- Voice input (speech-to-text) for the journal and the assistant ----
// Uses the browser's built-in SpeechRecognition. The mic hides itself where
// that isn't available. (Audio is handled by the device/browser's speech
// service; only the resulting text is kept, here on your device.)
function attachDictation(btn, field) {
  if (!btn || !field) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    btn.hidden = true;
    return;
  }
  let rec = null;
  let listening = false;
  let base = "";
  btn.addEventListener("click", () => {
    if (listening) {
      if (rec) rec.stop();
      return;
    }
    rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    base = field.value.trim() ? field.value.replace(/\s+$/, "") + " " : "";
    rec.onstart = () => {
      listening = true;
      btn.classList.add("listening");
      btn.setAttribute("aria-pressed", "true");
    };
    rec.onend = () => {
      listening = false;
      btn.classList.remove("listening");
      btn.setAttribute("aria-pressed", "false");
      rec = null;
      field.focus();
    };
    rec.onerror = () => {
      if (rec) {
        try { rec.stop(); } catch (e) {}
      }
    };
    rec.onresult = (e) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      field.value = base + txt;
      field.dispatchEvent(new Event("input"));
    };
    try { rec.start(); } catch (e) {}
  });
}

attachDictation(document.getElementById("journal-mic"), document.getElementById("journal-text"));
attachDictation(document.getElementById("chat-mic"), document.getElementById("chat-input"));

// Helpers the opt-in Friends feature reuses (friends.js), kept decoupled.
window.Lumen = { loadEntries, currentStreak, moodFace, friendlyDate };

// Initial paint — now that every helper above is defined.
render();

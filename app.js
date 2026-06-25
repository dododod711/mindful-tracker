// ===== Lumen — Mental Health Tracker =====
// All data is stored locally in the browser via localStorage.
//
// This script loads on both pages (Check-in/Journal and Insights). The two
// share storage but not markup, so every DOM lookup is guarded — a feature
// only wires itself up when its elements are present on the current page.

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

// ---- Live slider outputs (check-in page) ----
for (const id of ["sleep", "energy", "stress"]) {
  const input = document.getElementById(id);
  const out = document.getElementById(`${id}-out`);
  if (input && out) input.addEventListener("input", () => (out.value = input.value));
}

// ---- Check-in form (check-in page) ----
const form = document.getElementById("checkin-form");
const saveMsg = document.getElementById("save-msg");

if (form) {
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

    if (saveMsg) {
      saveMsg.hidden = false;
      setTimeout(() => (saveMsg.hidden = true), 3000);
    }
    render();
  });
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
  const hasToday = entries.some((en) => en.date === todayKey());
  form.querySelector('button[type="submit"]').textContent = hasToday
    ? "Update today's check-in"
    : "Save today's check-in";
}

// Pre-fill the form with today's check-in so updating doesn't start from
// scratch. Called once on load only — never during render, so it can't
// clobber edits in progress.
function prefillCheckinForm() {
  if (!form) return;
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
  banner.textContent = `🔥 ${streak}-day check-in streak`;
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
const entriesList = document.getElementById("entries");
if (entriesList) {
  entriesList.addEventListener("click", (e) => {
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
render();

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

  // Show the last few days back to the user — user text via textContent only.
  function renderGoodList() {
    if (!goodList) return;
    const days = loadFrom(GOOD_KEY)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
    goodList.hidden = days.length === 0;
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

  // Prefill today's, if it's already been written.
  const todaysGood = loadFrom(GOOD_KEY).find((g) => g.date === todayKey());
  if (todaysGood)
    todaysGood.items.forEach((t, n) => {
      if (goodInputs[n]) goodInputs[n].value = t;
    });
  renderGoodList();

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
    renderGoodList();
  });
}

// 5-4-3-2-1 grounding stepper.
const groundBtn = document.getElementById("ground-btn");
if (groundBtn) {
  const groundStep = document.getElementById("ground-step");
  const steps = [
    "Name 5 things you can see 👀",
    "Notice 4 things you can feel ✋",
    "Listen for 3 things you can hear 👂",
    "Find 2 things you can smell 👃",
    "Name 1 thing you can taste 👅",
    "Nicely done — notice how you feel now. 🌿",
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

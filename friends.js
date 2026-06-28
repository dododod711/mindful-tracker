// friends.js — opt-in networked friends for Lumen, backed by Supabase.
//
// Loads only where config.js + the supabase CDN are present. Every path is a
// safe no-op when Friends isn't configured or nobody is signed in, so the
// on-device core (check-ins, journal, insights) keeps working untouched and
// nothing syncs unless a signed-in user opts in.
(function () {
  "use strict";

  const cfg = window.LUMEN_CONFIG || {};
  const ready = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const pageEl = document.getElementById("friends-app");

  // The check-in form (app.js) calls this after every save. No-op until ready.
  window.LumenSync = { pushState: async function () {} };

  if (!ready) {
    if (pageEl) {
      pageEl.innerHTML =
        '<div class="card friends-setup">' +
        "<h2>Friends isn’t switched on yet</h2>" +
        "<p>This is the one part of Lumen that uses a small private backend, so you and people you approve can see each other’s mood and cheer each other on.</p>" +
        "<p>Add your free Supabase keys to <code>config.js</code> to turn it on — full steps are in <code>FRIENDS_SETUP.md</code>.</p>" +
        '<p class="friends-note">Until then, everything else in Lumen keeps working fully on your device.</p>' +
        "</div>";
    }
    return;
  }

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const L = window.Lumen || {};
  const moodFace = L.moodFace || (() => "·");
  const friendlyDate = L.friendlyDate || ((d) => d || "");

  // ---------- shared-state sync (any page that loads this script) ----------
  function localShared() {
    const entries = (L.loadEntries ? L.loadEntries() : [])
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
    const last = entries[entries.length - 1] || null;
    return {
      mood: last ? last.mood : null,
      streak: L.currentStreak ? L.currentStreak(entries) : 0,
      last_checkin: last ? last.date : null,
    };
  }

  window.LumenSync.pushState = async function () {
    try {
      const { data } = await sb.auth.getUser();
      if (!data || !data.user) return;
      await sb.from("shared_state").upsert({
        user_id: data.user.id,
        ...localShared(),
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      /* offline or signed out — ignore */
    }
  };

  // ---------- Personal cloud sync (private to the signed-in user) ----------
  // When signed in, a few localStorage blobs are mirrored to a private
  // user_state table so a person's own check-ins / journal / good things /
  // letters follow them across devices. Signed out, nothing leaves the device.
  //
  // Each blob is an array; we merge by a stable key (never clobbering a day or
  // item that exists on only one side). On a same-key conflict the local copy
  // wins, so the device you're actively using is authoritative.
  const SYNC_KEYS = {
    "mindful-entries": (x) => x.date,
    "mindful-journal": (x) => x.id,
    "mindful-good-things": (x) => x.date,
    "mindful-letters": (x) => x.id,
    "mindful-milestones": null, // array of scalar streak numbers
  };
  const SYNC_KEY_LIST = Object.keys(SYNC_KEYS);
  const UID_KEY = "lumen-sync-uid"; // who localStorage was last synced as
  const _setItem = localStorage.setItem.bind(localStorage);
  const safeParse = (s) => {
    try { return JSON.parse(s); } catch (e) { return null; }
  };

  function mergeKey(key, localVal, remoteVal) {
    const keyFn = SYNC_KEYS[key];
    const a = Array.isArray(localVal) ? localVal : [];
    const b = Array.isArray(remoteVal) ? remoteVal : [];
    if (!keyFn) return [...new Set([...b, ...a])]; // scalar union (milestones)
    const map = new Map();
    for (const it of b) if (it != null) map.set(keyFn(it), it); // remote first
    for (const it of a) if (it != null) map.set(keyFn(it), it); // local wins
    return [...map.values()];
  }

  async function currentUserId() {
    try {
      const { data } = await sb.auth.getUser();
      return data && data.user ? data.user.id : null;
    } catch (e) {
      return null;
    }
  }

  // Debounced push of whatever keys changed locally.
  let applyingRemote = false;
  const dirty = new Set();
  let pushTimer = null;
  localStorage.setItem = function (k, v) {
    _setItem(k, v);
    if (!applyingRemote && SYNC_KEY_LIST.indexOf(k) !== -1) {
      dirty.add(k);
      clearTimeout(pushTimer);
      pushTimer = setTimeout(flushPush, 1200);
    }
  };

  async function flushPush() {
    const uid = await currentUserId();
    if (!uid) { dirty.clear(); return; }
    const keys = [...dirty];
    dirty.clear();
    const rows = keys
      .map((k) => ({
        user_id: uid,
        key: k,
        value: safeParse(localStorage.getItem(k)),
        updated_at: new Date().toISOString(),
      }))
      .filter((r) => r.value != null);
    if (!rows.length) return;
    try { await sb.from("user_state").upsert(rows); } catch (e) { /* offline */ }
  }

  // Pull remote state, merge into local, push the merged result back, re-render.
  let pulling = null;
  function pull() {
    if (pulling) return pulling; // coalesce concurrent calls
    pulling = (async () => {
      const uid = await currentUserId();
      if (!uid) return;
      let rows;
      try {
        const res = await sb.from("user_state").select("key,value").eq("user_id", uid);
        if (res.error) return;
        rows = res.data || [];
      } catch (e) {
        return; // offline — keep working locally
      }
      const remote = {};
      for (const r of rows) remote[r.key] = r.value;

      // Shared-browser safety: only merge local up into the account if this is
      // the same person as last time (or the very first sign-in on this
      // browser). If a *different* account signs in, treat their cloud copy as
      // authoritative and replace local — never upload the previous user's
      // on-device data into someone else's account.
      let lastUid = null;
      try { lastUid = localStorage.getItem(UID_KEY); } catch (e) {}
      const differentUser = lastUid && lastUid !== uid;

      const toPush = [];
      applyingRemote = true;
      try {
        for (const key of SYNC_KEY_LIST) {
          const storedStr = localStorage.getItem(key);
          const localVal = differentUser ? [] : (safeParse(storedStr) || []);
          const remoteVal = remote[key] != null ? remote[key] : [];
          const merged = mergeKey(key, localVal, remoteVal);
          const mergedStr = JSON.stringify(merged);
          // Compare against what's actually stored so a different user with an
          // empty cloud copy still clears the previous user's local data.
          if (mergedStr !== (storedStr || "[]")) _setItem(key, mergedStr);
          if (mergedStr !== JSON.stringify(remoteVal)) {
            toPush.push({ user_id: uid, key, value: merged, updated_at: new Date().toISOString() });
          }
        }
        try { _setItem(UID_KEY, uid); } catch (e) {}
      } finally {
        applyingRemote = false;
      }
      if (toPush.length) {
        try { await sb.from("user_state").upsert(toPush); } catch (e) { /* offline */ }
      }
      if (typeof window.render === "function") { try { window.render(); } catch (e) {} }
      if (window.LumenSync.pushState) window.LumenSync.pushState();
    })().finally(() => { pulling = null; });
    return pulling;
  }

  window.LumenSync.pull = pull;

  // Sync on sign-in, on page load if a session already exists, and when the tab
  // regains focus (to catch edits made on another device).
  sb.auth.onAuthStateChange((event, session) => {
    if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) pull();
  });
  sb.auth.getSession().then(({ data }) => { if (data && data.session) pull(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pull(); });

  // If this isn't the Friends page, we're done after wiring sync.
  if (!pageEl) return;

  // ---------- Friends page UI ----------
  const $ = (id) => document.getElementById(id);
  const authView = $("auth-view");
  const guestView = $("guest-view");
  const friendsView = $("friends-view");

  // Guest = exploring without an account. Connecting needs a real session, so
  // the social features stay locked until they sign in. Remembered per tab.
  const isGuest = () => { try { return sessionStorage.getItem("lumen-guest") === "1"; } catch (e) { return false; } };
  const setGuest = (v) => { try { v ? sessionStorage.setItem("lumen-guest", "1") : sessionStorage.removeItem("lumen-guest"); } catch (e) {} };

  let mode = "signin"; // or "signup"

  function note(el, text, kind) {
    if (!el) return;
    el.textContent = text || "";
    el.hidden = !text;
    el.className = (el.className.replace(/\b(is-error|is-ok)\b/g, "").trim()) +
      (text ? (kind === "error" ? " is-error" : " is-ok") : "");
  }

  function setMode(next) {
    mode = next;
    $("tab-signin").classList.toggle("active", mode === "signin");
    $("tab-signup").classList.toggle("active", mode === "signup");
    $("username-field").hidden = mode !== "signup";
    $("auth-submit").textContent = mode === "signup" ? "Create account" : "Sign in";
    $("f-password").autocomplete = mode === "signup" ? "new-password" : "current-password";
    note($("auth-msg"), "");
  }

  $("tab-signin").addEventListener("click", () => setMode("signin"));
  $("tab-signup").addEventListener("click", () => setMode("signup"));

  $("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("f-email").value.trim();
    const password = $("f-password").value;
    const submit = $("auth-submit");
    submit.disabled = true;
    try {
      if (mode === "signup") {
        const uname = $("f-username").value.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,20}$/.test(uname)) {
          note($("auth-msg"), "Username: 3–20 letters, numbers or underscores.", "error");
          return;
        }
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { data: { username: uname, display_name: uname } },
        });
        if (error) { note($("auth-msg"), prettyAuthError(error), "error"); return; }
        if (!data.session) {
          note($("auth-msg"), "Account created — check your email to confirm, then sign in.", "ok");
          setMode("signin");
          return;
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) { note($("auth-msg"), prettyAuthError(error), "error"); return; }
      }
      // onAuthStateChange handles the re-render.
    } finally {
      submit.disabled = false;
    }
  });

  function prettyAuthError(error) {
    const m = (error && error.message) || "Something went wrong.";
    if (/already registered/i.test(m)) return "That email already has an account — try signing in.";
    if (/duplicate key|profiles_username/i.test(m)) return "That username is taken — pick another.";
    if (/invalid login/i.test(m)) return "Email or password doesn’t match.";
    return m;
  }

  $("sign-out").addEventListener("click", () => sb.auth.signOut());

  // ----- Add a friend -----
  $("add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const uname = $("add-username").value.trim();
    if (!uname) return;
    const { data, error } = await sb.rpc("request_friend", { uname });
    if (error) { note($("add-msg"), error.message, "error"); return; }
    const messages = {
      requested: "Request sent.",
      accepted: "You’re now friends!",
      already_friends: "You’re already friends.",
      pending: "There’s already a pending request between you.",
      not_found: "No one with that username.",
    };
    note($("add-msg"), messages[data] || "Done.", data === "not_found" ? "error" : "ok");
    if (data !== "not_found") $("add-username").value = "";
    refresh();
  });

  $("status-save").addEventListener("click", async () => {
    const status_note = $("status-note").value.trim();
    const { data } = await sb.auth.getUser();
    if (!data || !data.user) return;
    await sb.from("shared_state").upsert({
      user_id: data.user.id,
      ...localShared(),
      status_note,
      updated_at: new Date().toISOString(),
    });
    note($("add-msg"), "", "ok");
    $("status-save").textContent = "Saved";
    setTimeout(() => ($("status-save").textContent = "Save"), 1500);
  });

  $("refresh").addEventListener("click", refresh);

  // ----- Rendering the signed-in views -----
  async function loadMe(user) {
    const { data: prof } = await sb.from("profiles").select("username,display_name").eq("id", user.id).maybeSingle();
    $("you-name").textContent = prof ? "@" + prof.username : user.email;
    const { data: st } = await sb.from("shared_state").select("status_note").eq("user_id", user.id).maybeSingle();
    if (st && st.status_note) $("status-note").value = st.status_note;
    // Make sure our own shared state exists / is fresh.
    window.LumenSync.pushState();
  }

  function moodFaceFor(mood) {
    return mood ? moodFace(mood) : '<span class="friend-nomood">·</span>';
  }

  async function renderFriends() {
    const list = $("friends-list");
    const { data, error } = await sb.rpc("get_friends");
    if (error) { list.innerHTML = '<li class="empty-state">Couldn’t load friends.</li>'; return; }
    if (!data || !data.length) {
      list.innerHTML = '<li class="empty-state">No friends yet — add someone above.</li>';
      return;
    }
    list.innerHTML = data.map((f) => {
      const name = f.display_name || f.username;
      const when = f.last_checkin ? friendlyDate(f.last_checkin) : "no check-ins yet";
      const streak = f.streak ? `${f.streak}-day streak` : "";
      const status = f.status_note ? `<span class="friend-status">“${escapeHtml(f.status_note)}”</span>` : "";
      const meta = [streak, "last check-in " + when].filter(Boolean).join(" · ");
      return (
        '<li class="friend-row">' +
        `<span class="friend-mood">${moodFaceFor(f.mood)}</span>` +
        '<span class="friend-info">' +
        `<span class="friend-name">${escapeHtml(name)} <span class="friend-handle">@${escapeHtml(f.username)}</span></span>` +
        `<span class="friend-meta">${escapeHtml(meta)}</span>` +
        status +
        "</span>" +
        '<span class="friend-actions">' +
        `<button class="btn-ghost enc-btn" data-id="${f.id}" data-name="${escapeHtml(name)}">Encourage</button>` +
        `<button class="friend-remove" data-id="${f.id}" aria-label="Remove ${escapeHtml(name)}">Remove</button>` +
        "</span>" +
        "</li>"
      );
    }).join("");

    list.querySelectorAll(".enc-btn").forEach((b) =>
      b.addEventListener("click", async () => {
        b.disabled = true;
        const { data: res } = await sb.rpc("send_encouragement", { target: b.dataset.id, kind: "support" });
        b.textContent = res === "not_friends" ? "Not friends" : "Sent";
        setTimeout(() => { b.textContent = "Encourage"; b.disabled = false; }, 1600);
      })
    );
    list.querySelectorAll(".friend-remove").forEach((b) =>
      b.addEventListener("click", async () => {
        if (!confirm("Remove this friend?")) return;
        await sb.rpc("unfriend", { other: b.dataset.id });
        refresh();
      })
    );
  }

  async function renderRequests() {
    const card = $("requests-card");
    const list = $("requests-list");
    const { data } = await sb.rpc("get_pending");
    const incoming = (data || []).filter((r) => r.direction === "incoming");
    const outgoing = (data || []).filter((r) => r.direction === "outgoing");
    if (!incoming.length && !outgoing.length) { card.hidden = true; return; }
    card.hidden = false;
    list.innerHTML =
      incoming.map((r) =>
        '<li class="req-row">' +
        `<span class="req-name">${escapeHtml(r.display_name || r.username)} <span class="friend-handle">@${escapeHtml(r.username)}</span> wants to connect</span>` +
        '<span class="req-actions">' +
        `<button class="btn-primary req-accept" data-id="${r.id}">Accept</button>` +
        `<button class="btn-ghost req-decline" data-id="${r.id}">Decline</button>` +
        "</span></li>"
      ).join("") +
      outgoing.map((r) =>
        '<li class="req-row req-out">' +
        `<span class="req-name">Request sent to <strong>@${escapeHtml(r.username)}</strong></span>` +
        "</li>"
      ).join("");

    list.querySelectorAll(".req-accept").forEach((b) =>
      b.addEventListener("click", async () => { await sb.rpc("respond_request", { req_id: b.dataset.id, accept: true }); refresh(); })
    );
    list.querySelectorAll(".req-decline").forEach((b) =>
      b.addEventListener("click", async () => { await sb.rpc("respond_request", { req_id: b.dataset.id, accept: false }); refresh(); })
    );
  }

  async function renderEncouragements() {
    const card = $("encouragements-card");
    const list = $("encouragements-list");
    const { data } = await sb.rpc("get_encouragements");
    if (!data || !data.length) { card.hidden = true; return; }
    card.hidden = false;
    list.innerHTML = data.map((e) =>
      '<li class="enc-row">' +
      '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20C6.5 16 4 12.8 4 9.8A3.6 3.6 0 0 1 12 8 3.6 3.6 0 0 1 20 9.8c0 3-2.5 6.2-8 10.2z"/></svg>' +
      `<span><strong>${escapeHtml(e.from_display || e.from_username)}</strong> is thinking of you <span class="enc-when">${escapeHtml(friendlyDate(e.created_at.slice(0, 10)))}</span></span>` +
      "</li>"
    ).join("");
    sb.rpc("mark_encouragements_read");
  }

  function refresh() {
    renderRequests();
    renderFriends();
    renderEncouragements();
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  // ----- Live updates via Supabase Realtime (RLS-scoped to you + your friends) -----
  let channel = null;
  async function startRealtime(user) {
    stopRealtime();
    try {
      const { data } = await sb.auth.getSession();
      if (data && data.session) sb.realtime.setAuth(data.session.access_token);
    } catch (e) {}
    channel = sb
      .channel("lumen-" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "shared_state" }, () => renderFriends())
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => { renderRequests(); renderFriends(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "encouragements", filter: "to_user=eq." + user.id }, () => renderEncouragements())
      .subscribe();
  }
  function stopRealtime() {
    if (channel) {
      try { sb.removeChannel(channel); } catch (e) {}
      channel = null;
    }
  }

  // ----- Auth state drives which view shows: auth / guest / signed-in -----
  function showAuth() {
    stopRealtime();
    authView.hidden = false;
    guestView.hidden = true;
    friendsView.hidden = true;
  }
  function showGuest() {
    stopRealtime();
    authView.hidden = true;
    guestView.hidden = false;
    friendsView.hidden = true;
  }
  async function showSignedIn(user) {
    authView.hidden = true;
    guestView.hidden = true;
    friendsView.hidden = false;
    await loadMe(user);
    refresh();
    startRealtime(user);
  }
  // No session: a guest sees the locked panel, everyone else the sign-in form.
  function showSignedOut() {
    setMode("signin");
    if (isGuest()) showGuest();
    else showAuth();
  }

  $("guest-enter").addEventListener("click", () => { setGuest(true); showGuest(); });
  $("guest-signin").addEventListener("click", () => { setGuest(false); showAuth(); });

  sb.auth.getSession().then(({ data }) => {
    if (data.session) { setGuest(false); showSignedIn(data.session.user); }
    else showSignedOut();
  });
  sb.auth.onAuthStateChange((_event, session) => {
    if (session) { setGuest(false); showSignedIn(session.user); }
    else showSignedOut();
  });

  setMode("signin");
})();

// ===== Lumen — Stargazing =====
// A calm spiral galaxy you steer with gentle movement. Motion comes from the
// camera (frame differencing, computed locally — no video ever leaves the
// device) or, as a fallback, the pointer / device tilt. Special "feature"
// stars embedded in the arms carry short notes on mindfulness, psychology,
// and support.

// ---- Content: the stars worth drifting toward ----
// cat: mind | psych | res  ·  kind: star (small) | planet (bright, ringed)
const BODIES = [
  { cat: "mind", kind: "planet", title: "Box Breathing",
    body: "In for 4, hold for 4, out for 4, hold for 4. Lengthening the exhale gently nudges your nervous system toward calm. Try a few rounds." },
  { cat: "mind", kind: "star", title: "Body Scan",
    body: "Move your attention slowly from head to toe, noticing each sensation without trying to change it. A quiet way back into the present." },
  { cat: "mind", kind: "star", title: "5 · 4 · 3 · 2 · 1",
    body: "Name 5 things you can see, 4 you can feel, 3 you can hear, 2 you can smell, 1 you can taste. Grounding for when thoughts race." },
  { cat: "mind", kind: "star", title: "One Thing at a Time",
    body: "Single-tasking isn't slower. Attention given fully to one thing tends to feel calmer — and finishes cleaner — than scattered effort." },
  { cat: "psych", kind: "planet", title: "Name It to Tame It",
    body: "Putting a feeling into words — 'I notice I feel anxious' — measurably lowers its intensity. Naming an emotion helps loosen its grip." },
  { cat: "psych", kind: "star", title: "The Negativity Bias",
    body: "Brains evolved to weigh threats more heavily than good things. Knowing this, you can deliberately pause and savour the good moments." },
  { cat: "psych", kind: "star", title: "Reframe the Story",
    body: "An event is neutral; the story we tell about it shapes the feeling. Ask gently: is there a kinder, equally true way to read this?" },
  { cat: "psych", kind: "planet", title: "Sleep Holds Mood",
    body: "Sleep restores the body and helps settle emotion overnight. Protecting it is one of the highest-leverage things you can do for how you feel." },
  { cat: "psych", kind: "star", title: "Be Your Own Friend",
    body: "Speak to yourself as you would to someone you care about. Self-kindness predicts resilience far better than harsh self-criticism." },
  { cat: "res", kind: "planet", title: "988 Lifeline",
    body: "In the US, call or text 988 any time for free, confidential support during a crisis. You don't have to be sure it's 'bad enough' to reach out." },
  { cat: "res", kind: "star", title: "Crisis Text Line",
    body: "Prefer to text? In the US, text HOME to 741741 to reach a trained volunteer counselor, any time, day or night." },
  { cat: "res", kind: "planet", title: "Talk to Someone",
    body: "Therapy isn't only for emergencies. A counselor can help you build skills and notice patterns that are hard to see on your own." },
];

const CAT_COLOR = { mind: "#5fd0c0", psych: "#9b8cff", res: "#f0b27a", you: "#f2a0c0" };
const CAT_LABEL = { mind: "Lumenness", psych: "Psychology", res: "Resource", you: "Your journal" };

// The user's own journal entries (written on the Check-in page) become stars
// too. Read from the same localStorage key the rest of the app uses.
const JOURNAL_KEY = "mindful-journal";
function loadJournal() {
  try {
    return JSON.parse(localStorage.getItem(JOURNAL_KEY)) || [];
  } catch {
    return [];
  }
}

// Daily check-ins carry a mood (1–5) and an optional note. We tint each of the
// user's stars by the mood logged that same day, so the sky reflects how those
// days actually felt — using a brighter version of the app's red→green scale.
const ENTRIES_KEY = "mindful-entries";
function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(ENTRIES_KEY)) || [];
  } catch {
    return [];
  }
}
const MOOD_COLOR = { 1: "#d97363", 2: "#d99a5e", 3: "#cdb15c", 4: "#9cc070", 5: "#8caf91" };
const MOOD_LABEL = { 1: "Rough", 2: "Low", 3: "Okay", 4: "Good", 5: "Great" };
const dayKey = (ts) => {
  const d = new Date(ts);
  if (isNaN(+d)) return null;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const prettyDay = (key) => {
  const d = new Date(key + "T12:00:00");
  return isNaN(+d) ? key : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- Planet & ring constants ----
const TILT = 0.42;         // ring/orbit-plane squash → seen at an angle
const PLANET_R = 0.3;      // planet radius, in scene units (× R)
const RING_IN = 0.42, RING_OUT = 0.8;   // ring band, in scene units
let R = 0;                 // scene scale in px (set on resize)

// ---- Canvas setup ----
const stage = document.getElementById("stage");
const ctx = stage.getContext("2d");
let W = 0, H = 0, DPR = 1;

function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  // Use the canvas's own laid-out size (it's fixed/inset:0, so this is the
  // viewport) rather than innerWidth — more robust across embeddings.
  W = stage.clientWidth || innerWidth;
  H = stage.clientHeight || innerHeight;
  stage.width = Math.round(W * DPR);
  stage.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  R = Math.min(W, H) * 0.46; // zoomed out: disc fits with room around it
}
addEventListener("resize", resize);
resize();

// ---- Build the rings ----
// Ring particles orbit in the tilted ring plane. Each keeps a radius, a start
// angle and a spin speed (inner rings sweep a touch faster), plus a brightness
// bucket so draws can be batched by colour.
const RING_COUNT = window.innerWidth < 600 ? 1100 : 2200;
const ring = new Array(RING_COUNT);
for (let i = 0; i < RING_COUNT; i++) {
  let ro = RING_IN + Math.random() * (RING_OUT - RING_IN);
  if (ro > 0.585 && ro < 0.625) ro += 0.06; // carve a faint Cassini-style gap
  const t01 = (ro - RING_IN) / (RING_OUT - RING_IN);
  ring[i] = {
    ro,
    ang: Math.random() * Math.PI * 2,
    speed: 0.18 - t01 * 0.08,
    bucket: Math.random() < 0.5 ? 1 : 0,
  };
}
const RING_COL = ["rgba(206,190,158,0.5)", "rgba(245,238,214,0.9)"]; // icy gold

// ---- Build the planet (a sphere of dots) ----
const lerp = (a, b, f) => a + (b - a) * f;
// Even spread of points over a unit sphere (Fibonacci spiral). Each dot keeps a
// fixed latitude-band colour; lighting + spin are applied per frame.
const PLANET_DOTS = window.innerWidth < 600 ? 1500 : 2600;
const sphere = new Array(PLANET_DOTS);
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
for (let i = 0; i < PLANET_DOTS; i++) {
  const y = 1 - (i / (PLANET_DOTS - 1)) * 2;        // 1 → -1
  const rad = Math.sqrt(Math.max(0, 1 - y * y));
  const th = GOLDEN * i;
  const f = 0.5 + 0.5 * Math.sin(y * 7);            // gas-giant latitude bands
  sphere[i] = {
    x: Math.cos(th) * rad, y, z: Math.sin(th) * rad,
    r: Math.round(lerp(70, 176, f)),
    g: Math.round(lerp(132, 216, f)),
    b: Math.round(lerp(166, 236, f)),
  };
}

// Feature bodies (curated notes + the user's journal entries) become moons
// orbiting in the ring plane. Orbits are cached by key so entries keep their
// path across rebuilds.
let bodies = [];
const placement = new Map();
function placeFor(key, make) {
  if (!placement.has(key)) placement.set(key, make());
  return placement.get(key);
}
const orbitSpeed = () => (reduceMotion ? 0 : 1) * (0.04 + Math.random() * 0.05);

function buildBodies() {
  const list = [];

  // Curated content, spread across orbits by index.
  BODIES.forEach((b, ci) => {
    const o = placeFor("c" + ci, () => ({
      ro: 0.52 + (ci / BODIES.length) * 0.52,
      ang: Math.random() * Math.PI * 2,
      speed: orbitSpeed() * (ci % 2 ? 1 : -1),
    }));
    list.push({ ...b, key: "c" + ci, color: CAT_COLOR[b.cat],
      ro: o.ro, ang: o.ang, speed: o.speed, r: b.kind === "planet" ? 4.2 : 3.0 });
  });

  // The user's journal entries take their own orbits, tinted by that day's mood.
  const moodByDay = {};
  for (const e of loadEntries()) if (e && e.date) moodByDay[e.date] = e.mood;

  loadJournal().forEach((n) => {
    if (!n || !n.text) return;
    const when = new Date(n.ts);
    const mood = moodByDay[dayKey(n.ts)];
    const o = placeFor("j" + n.id, () => ({
      ro: 0.55 + Math.random() * 0.55,
      ang: Math.random() * Math.PI * 2,
      speed: orbitSpeed() * (Math.random() < 0.5 ? 1 : -1),
    }));
    list.push({
      cat: "you", kind: "star", key: "j" + n.id,
      color: mood ? MOOD_COLOR[mood] : CAT_COLOR.you, mood: mood || null,
      title: isNaN(+when)
        ? "Journal note"
        : when.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      body: n.text, ro: o.ro, ang: o.ang, speed: o.speed, r: 3.0,
    });
  });

  // Check-in notes become stars too, each in its own day's mood colour.
  loadEntries().forEach((e) => {
    if (!e || !e.note || !e.note.trim()) return;
    const o = placeFor("e" + e.date, () => ({
      ro: 0.55 + Math.random() * 0.55,
      ang: Math.random() * Math.PI * 2,
      speed: orbitSpeed() * (Math.random() < 0.5 ? 1 : -1),
    }));
    list.push({
      cat: "you", kind: "star", key: "e" + e.date,
      color: e.mood ? MOOD_COLOR[e.mood] : CAT_COLOR.you, mood: e.mood || null,
      title: prettyDay(e.date),
      body: e.note, ro: o.ro, ang: o.ang, speed: o.speed, r: 3.0,
    });
  });

  bodies = list.map((b, i) => ({ ...b, i, cx: 0, cy: 0, front: true }));
  buildIndexList();
}

// A field of distant stars across the whole sky for depth.
const fg = Array.from({ length: 120 }, () => ({
  x: Math.random(), y: Math.random(),
  z: 0.4 + Math.random() * 0.6,
  tw: Math.random() * Math.PI * 2,
}));

// ---- Motion state ----
const look = { x: 0, y: 0, tx: 0, ty: 0 };
const zoom = { v: 1, target: 1 };   // galaxy scale; hands / wheel / keys drive target
const ZOOM_MIN = 0.5, ZOOM_MAX = 2.6;
let energy = 0;              // how much the camera is moving, 0..1
let spin = 0;                // planet spin phase (accelerates with energy)
let ringPhase = 0;           // ring sweep phase (accelerates with energy)
let prevTx = 0, prevTy = 0;  // last look target, for motion velocity
let shootingStars = [];
let mx = -1, my = -1;        // pointer, for hover labels

function setZoom(target) {
  zoom.target = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, target));
}
function nudgeZoom(factor) {
  setZoom(zoom.target * factor);
}

// ---- Box breathing ----
// A 4·4·4·4 guide: the whole system swells on the inhale and settles on the
// exhale, so the planet itself paces your breath.
const BREATH_PHASES = [["Breathe in", 4], ["Hold", 4], ["Breathe out", 4], ["Hold", 4]];
const BREATH_TOTAL = BREATH_PHASES.reduce((s, p) => s + p[1], 0);
const breath = { active: false, t0: 0 };
let breatheScale = 1;

// ---- Pointer / tilt fallback ----
let cameraOn = false;

addEventListener("pointermove", (e) => {
  mx = e.clientX; my = e.clientY;
  if (cameraOn) return;
  look.tx = (e.clientX / innerWidth - 0.5) * 2;
  look.ty = (e.clientY / innerHeight - 0.5) * 2;
}, { passive: true });

addEventListener("deviceorientation", (e) => {
  if (cameraOn || e.gamma == null) return;
  look.tx = Math.max(-1, Math.min(1, e.gamma / 35));
  look.ty = Math.max(-1, Math.min(1, ((e.beta || 0) - 40) / 35));
}, { passive: true });

// ---- Camera motion sensing ----
const cam = document.getElementById("cam");
const camPreview = document.getElementById("cam-preview");
const camThumb = document.getElementById("cam-thumb");
const motionCanvas = document.getElementById("motion");
const mctx = motionCanvas.getContext("2d", { willReadFrequently: true });
const MW = motionCanvas.width, MH = motionCanvas.height;
let prevGray = null;
let stream = null;
let motionTimer = null;
let handMode = false; // true once real MediaPipe hand tracking is running

async function startCamera() {
  if (cameraOn) return true;
  try {
    // 320×240 is the downscaled input the detector works on — small and fast.
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: "user" },
      audio: false,
    });
  } catch {
    setStatus("Camera unavailable — steer with your cursor instead", true);
    return false;
  }
  cam.srcObject = stream;
  camPreview.srcObject = stream;
  await cam.play().catch(() => {});
  camPreview.play().catch(() => {});
  cameraOn = true;
  prevGray = null;
  camThumb.hidden = false;
  toggleCameraBtn.textContent = "Camera on";

  // Prefer real hand tracking; fall back to frame-difference motion if the
  // MediaPipe model can't load (offline) or the device can't run it.
  handMode = false;
  if (window.LumenHands) {
    setStatus("Loading hand tracking…");
    try {
      handMode = await window.LumenHands.start(cam, {
        onPan: (x, y) => { look.tx = x; look.ty = y; },
        onZoom: (z) => setZoom(z),
        onPinch: (nx, ny) => {       // normalized, already mirrored
          const b = nearestBody(nx * W, ny * H, 130);
          if (b) openBody(b);
        },
        onFist: () => closePanel(),
      });
    } catch {
      handMode = false;
    }
  }

  if (handMode) {
    setStatus("Move a hand to orbit · spread two hands to zoom · pinch to open");
  } else {
    setStatus("Sway to orbit · spread your hands to zoom");
    motionTimer = setInterval(sampleMotion, 66);
  }
  return true;
}

function stopCamera() {
  cameraOn = false;
  if (window.LumenHands) window.LumenHands.stop();
  handMode = false;
  clearInterval(motionTimer);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  cam.srcObject = camPreview.srcObject = null;
  camThumb.hidden = true;
  toggleCameraBtn.textContent = "Camera off";
  setStatus("Move your cursor to orbit the planet");
}

function sampleMotion() {
  if (!cameraOn || cam.readyState < 2) return;
  mctx.drawImage(cam, 0, 0, MW, MH);
  const { data } = mctx.getImageData(0, 0, MW, MH);
  const gray = new Float32Array(MW * MH);
  for (let p = 0, g = 0; p < data.length; p += 4, g++) {
    gray[g] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  if (prevGray) {
    let sum = 0, sx = 0, sy = 0, sxx = 0, syy = 0;
    for (let y = 0, g = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++, g++) {
        const d = Math.abs(gray[g] - prevGray[g]);
        if (d > 18) { sum += d; sx += x * d; sy += y * d; sxx += x * x * d; syy += y * y * d; }
      }
    }
    if (sum > 500) {
      const mxn = sx / sum, myn = sy / sum;       // mean motion point (px)
      const cx = 1 - mxn / MW; // mirror X
      const cy = myn / MH;
      look.tx = (cx - 0.5) * 2;
      look.ty = (cy - 0.5) * 2;

      // Spread of the moving pixels ≈ how far apart your hands are. Wide →
      // zoom in, together → zoom out. Normalised by the frame diagonal.
      const varX = Math.max(0, sxx / sum - mxn * mxn);
      const varY = Math.max(0, syy / sum - myn * myn);
      const spread = Math.sqrt(varX + varY) / Math.hypot(MW, MH);
      // spread ~0.10 at rest → neutral; ~0.30 with arms wide → zoomed in.
      const target = 0.6 + ((spread - 0.10) / 0.20) * 1.6;
      setZoom(zoom.target * 0.8 + target * 0.2); // ease toward the gesture
    }
    // (Overall motion energy is derived centrally in the render loop.)
  }
  prevGray = gray;
}

function spawnShootingStar() {
  shootingStars.push({
    x: Math.random() * W, y: Math.random() * H * 0.4,
    vx: 5 + Math.random() * 4, vy: 3 + Math.random() * 3, life: 1,
  });
}

// ---- Projection: a point (u,v) in the ring plane → screen ----
let _ox = 0, _oy = 0, Rz = R, tiltY = TILT;
function updateProjection() {
  Rz = R * zoom.v * breatheScale;
  // Wider pan than before, plus a small wobble that grows with motion.
  _ox = W / 2 - look.x * 150 + Math.sin(t * 2.0) * energy * 12;
  _oy = H / 2 - look.y * 120 + Math.cos(t * 2.3) * energy * 9;
  // Vertical look tips the rings open or closed, for a 3D feel.
  tiltY = Math.max(0.14, Math.min(0.74, TILT + look.y * 0.24));
}

// ---- Render loop ----
let t = 0;
function frame() {
  t += 0.016;
  look.x += (look.tx - look.x) * 0.05;
  look.y += (look.ty - look.y) * 0.05;
  zoom.v += (zoom.target - zoom.v) * 0.06;

  // Motion energy: how fast the controlling point (hand / camera centroid /
  // cursor) is moving. Drives spin, swirl, wobble and shooting stars.
  if (cameraOn) {
    const dvx = look.tx - prevTx, dvy = look.ty - prevTy;
    energy = Math.min(1, energy * 0.9 + Math.hypot(dvx, dvy) * 5);
  } else {
    energy *= 0.94;
  }
  prevTx = look.tx; prevTy = look.ty;
  if (cameraOn && energy > 0.32 && shootingStars.length < 5 && !reduceMotion &&
      Math.random() < energy * 0.35) spawnShootingStar();

  // Spin/sweep accelerate with motion, so the world surges when you move.
  spin += (0.12 + energy * 1.9) * 0.016;
  ringPhase += (1 + energy * 3.2) * 0.016;

  updateBreath();
  updateProjection();

  const pr = PLANET_R * Rz; // planet radius in px

  // Deep space.
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#05060f";
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "lighter";

  // Distant stars across the whole sky (parallax + faint twinkle).
  for (const s of fg) {
    const par = s.z * 40;
    const x = s.x * W - look.x * par;
    const y = s.y * H - look.y * par;
    const a = (0.3 + s.z * 0.5) * (0.6 + 0.4 * Math.sin(t * 1.5 + s.tw));
    ctx.fillStyle = `rgba(220,228,255,${a.toFixed(3)})`;
    ctx.fillRect(x, y, s.z > 0.85 ? 2 : 1, s.z > 0.85 ? 2 : 1);
  }

  // Place the moons on their orbits; they swirl faster as you move. Depth =
  // which half of the plane they're in.
  for (const b of bodies) {
    b.ang += b.speed * 0.016 * (1 + energy * 1.8);
    const u = Math.cos(b.ang) * b.ro, v = Math.sin(b.ang) * b.ro;
    b.cx = _ox + u * Rz;
    b.cy = _oy + v * Rz * tiltY;
    b.front = v >= 0;
  }

  // Back half: far rings + moons behind, then the opaque planet covers them.
  drawRings(false, pr);
  for (const b of bodies) if (!b.front) drawBody(b);

  ctx.globalCompositeOperation = "source-over";
  drawPlanet(_ox, _oy, pr);
  ctx.globalCompositeOperation = "lighter";
  drawGlow(_ox, _oy, pr * 1.5, "rgba(120,180,210,0.20)"); // atmosphere

  // Front half: near rings, then moons in front.
  drawRings(true, pr);
  for (const b of bodies) if (b.front) drawBody(b);

  // Shooting stars (a flourish when there's lots of motion).
  shootingStars = shootingStars.filter((s) => s.life > 0);
  for (const s of shootingStars) {
    s.x += s.vx; s.y += s.vy; s.life -= 0.012;
    ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, s.life).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * 4, s.y - s.vy * 4);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "source-over";
  requestAnimationFrame(frame);
}

// Draw the ring particles whose near/far half matches `front`. Particles in
// the back half are skipped where the planet's disc would hide them.
function drawRings(front, pr) {
  for (let bkt = 0; bkt < 2; bkt++) {
    ctx.fillStyle = RING_COL[bkt];
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      if (p.bucket !== bkt) continue;
      const a = p.ang + (reduceMotion ? 0 : ringPhase * p.speed);
      const v = Math.sin(a) * p.ro;
      if ((v >= 0) !== front) continue;
      const x = _ox + Math.cos(a) * p.ro * Rz;
      const y = _oy + v * Rz * tiltY;
      if (!front && Math.hypot(x - _ox, y - _oy) < pr) continue; // hidden by planet
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function drawGlow(x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlanet(px, py, pr) {
  // A dim solid body first, so background stars and the far rings don't show
  // through the gaps between dots.
  ctx.globalCompositeOperation = "source-over";
  const base = ctx.createRadialGradient(px - pr * 0.35, py - pr * 0.4, pr * 0.1, px, py, pr);
  base.addColorStop(0, "#12273a");
  base.addColorStop(1, "#05080f");
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, Math.PI * 2);
  ctx.fill();

  // The surface itself: dots over the front hemisphere, lit from the upper-left
  // and slowly spinning. Latitude bands come from each dot's baked colour.
  ctx.globalCompositeOperation = "lighter";
  const s = reduceMotion ? 0 : spin;              // spin (accelerates with motion)
  const cs = Math.cos(s), sn = Math.sin(s);
  const LX = -0.45, LY = 0.55, LZ = 0.70;         // light direction
  for (let i = 0; i < sphere.length; i++) {
    const p = sphere[i];
    const x = p.x * cs + p.z * sn;
    const z = -p.x * sn + p.z * cs;
    if (z <= 0) continue;                          // front hemisphere only
    const bright = Math.max(0, x * LX + p.y * LY + z * LZ);
    const a = 0.14 + 0.86 * bright;
    ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${a.toFixed(3)})`;
    const sz = z > 0.5 ? 2 : 1;
    ctx.fillRect(px + x * pr, py - p.y * pr, sz, sz);
  }
}

function drawBody(b) {
  const pulse = 1 + 0.16 * Math.sin(t * 1.4 + b.i);
  const base = b.kind === "planet" ? 3.4 : 2.4;
  const r = base * (0.85 + 0.15 * zoom.v) * pulse;
  const hovered = b.selected || (mx >= 0 && Math.hypot(mx - b.cx, my - b.cy) < r * 3 + 16);

  // coloured halo
  const glow = ctx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, r * 3.2);
  glow.addColorStop(0, b.color);
  glow.addColorStop(0.35, b.color + "66");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(b.cx, b.cy, r * 3.2, 0, Math.PI * 2);
  ctx.fill();

  // bright moon core
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(b.cx, b.cy, r * 0.72, 0, Math.PI * 2);
  ctx.fill();

  if (hovered) {
    ctx.globalCompositeOperation = "source-over";
    ctx.font = "600 13px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillText(b.title, b.cx + 1, b.cy - r - 9);
    ctx.fillStyle = "#fff";
    ctx.fillText(b.title, b.cx, b.cy - r - 10);
    ctx.globalCompositeOperation = "lighter";
  }
}

requestAnimationFrame(frame);

// ---- Selecting a body ----
const panel = document.getElementById("panel");
const panelChip = document.getElementById("panel-chip");
const panelTitle = document.getElementById("panel-title");
const panelBody = document.getElementById("panel-body");

function openBody(b) {
  bodies.forEach((x) => (x.selected = false));
  b.selected = true;
  panelChip.className = "panel-chip " + b.cat;
  panelChip.textContent = b.mood ? CAT_LABEL[b.cat] + " · " + MOOD_LABEL[b.mood] : CAT_LABEL[b.cat];
  panelTitle.textContent = b.title;
  panelBody.textContent = b.body;
  panel.classList.add("open");
}

function closePanel() {
  bodies.forEach((x) => (x.selected = false));
  panel.classList.remove("open");
}

function hitTest(px, py) {
  let best = null, bestD = Infinity;
  for (const b of bodies) {
    const d = Math.hypot(px - b.cx, py - b.cy);
    const base = b.kind === "planet" ? 3.6 : 2.4;
    const reach = base * (0.85 + 0.15 * zoom.v) * 3 + 18;
    if (d < reach && d < bestD) { best = b; bestD = d; }
  }
  return best;
}

// Nearest body to a point within a generous radius — used by the pinch gesture,
// where pointing is coarser than a mouse click.
function nearestBody(px, py, maxDist) {
  let best = null, bestD = maxDist;
  for (const b of bodies) {
    const d = Math.hypot(px - b.cx, py - b.cy);
    if (d < bestD) { best = b; bestD = d; }
  }
  return best;
}

stage.addEventListener("click", (e) => {
  const b = hitTest(e.clientX, e.clientY);
  if (b) openBody(b);
  else closePanel();
});

stage.addEventListener("pointermove", (e) => {
  stage.style.cursor = hitTest(e.clientX, e.clientY) ? "pointer" : "grab";
});

document.getElementById("panel-close").addEventListener("click", closePanel);
addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closePanel(); closeIndex(); }
  else if (e.key === "+" || e.key === "=") nudgeZoom(1.12);
  else if (e.key === "-" || e.key === "_") nudgeZoom(1 / 1.12);
});

// Wheel / trackpad zoom (a reliable path alongside the hand gesture).
stage.addEventListener("wheel", (e) => {
  e.preventDefault();
  nudgeZoom(e.deltaY < 0 ? 1.08 : 1 / 1.08);
}, { passive: false });

// Two-finger pinch zoom on touch screens.
let pinchStart = 0, pinchZoom = 1;
stage.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    pinchStart = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY);
    pinchZoom = zoom.target;
  }
}, { passive: true });
stage.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2 && pinchStart) {
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY);
    setZoom(pinchZoom * (dist / pinchStart));
  }
}, { passive: true });

// ---- Accessible index list ----
const indexList = document.getElementById("index-list");
const indexItems = document.getElementById("index-items");
const toggleIndexBtn = document.getElementById("toggle-index");

function buildIndexList() {
  indexItems.textContent = "";
  for (const b of bodies) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    const cat = document.createElement("span");
    cat.className = "item-cat " + b.cat;
    cat.textContent = b.mood ? CAT_LABEL[b.cat] + " · " + MOOD_LABEL[b.mood] : CAT_LABEL[b.cat];
    btn.appendChild(cat);
    btn.appendChild(document.createTextNode(b.title));
    btn.addEventListener("click", () => { openBody(b); closeIndex(); });
    li.appendChild(btn);
    indexItems.appendChild(li);
  }
}

function closeIndex() {
  indexList.classList.remove("open");
  indexList.setAttribute("aria-hidden", "true");
  toggleIndexBtn.setAttribute("aria-expanded", "false");
}
toggleIndexBtn.addEventListener("click", () => {
  const open = indexList.classList.toggle("open");
  indexList.setAttribute("aria-hidden", String(!open));
  toggleIndexBtn.setAttribute("aria-expanded", String(open));
});

// ---- Controls / intro wiring ----
const intro = document.getElementById("intro");
const statusEl = document.getElementById("status");
const toggleCameraBtn = document.getElementById("toggle-camera");

function setStatus(msg, warn) {
  statusEl.innerHTML = warn ? msg : `<b>✦</b> ${msg}`;
}

function dismissIntro() {
  intro.classList.add("fading");
  setTimeout(() => (intro.hidden = true), 600);
}

document.getElementById("start-camera").addEventListener("click", async () => {
  dismissIntro();
  await startCamera();
});
document.getElementById("start-pointer").addEventListener("click", () => {
  dismissIntro();
  setStatus("Move your cursor to orbit the planet");
});
toggleCameraBtn.addEventListener("click", () => {
  if (cameraOn) stopCamera();
  else startCamera();
});

// Box-breathing guide.
const breatheBtn = document.getElementById("breathe-btn");
const breathCue = document.getElementById("breath-cue");
const breathPhaseEl = document.getElementById("breath-phase");

breatheBtn.addEventListener("click", () => {
  breath.active = !breath.active;
  breath.t0 = t;
  breatheBtn.textContent = breath.active ? "◼ Stop" : "◯ Breathe";
  breathCue.hidden = !breath.active;
  if (breath.active) setStatus("Box breathing · in 4 · hold 4 · out 4 · hold 4");
});

// Advance the breathing cycle and set the swell the projection reads.
function updateBreath() {
  if (!breath.active) {
    breatheScale += (1 - breatheScale) * 0.1; // ease back to rest when stopped
    return;
  }
  const e = (t - breath.t0) % BREATH_TOTAL;
  let acc = 0, idx = 0;
  for (let i = 0; i < BREATH_PHASES.length; i++) {
    if (e < acc + BREATH_PHASES[i][1]) { idx = i; break; }
    acc += BREATH_PHASES[i][1];
  }
  const into = (e - acc) / BREATH_PHASES[idx][1]; // 0..1 within the phase
  // Cosine-eased swell: inhale 0→1, hold high, exhale 1→0, hold low.
  let s;
  if (idx === 0) s = (1 - Math.cos(into * Math.PI)) / 2;
  else if (idx === 1) s = 1;
  else if (idx === 2) s = (1 + Math.cos(into * Math.PI)) / 2;
  else s = 0;
  breatheScale = 1 + s * 0.35;
  if (breathPhaseEl.textContent !== BREATH_PHASES[idx][0]) {
    breathPhaseEl.textContent = BREATH_PHASES[idx][0];
  }
}

// Release the camera while the tab is hidden; resume when it returns, and
// pick up any journal entries written in the meantime.
let wantCamera = false;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    wantCamera = cameraOn;
    if (cameraOn) stopCamera();
  } else {
    buildBodies();
    if (wantCamera) { wantCamera = false; startCamera(); }
  }
});
// Returning via bfcache (back button) doesn't fire visibilitychange.
addEventListener("pageshow", buildBodies);

// ---- Go ----
buildBodies();

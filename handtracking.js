// ===== Mindful — Hand tracking =====
// Real hand tracking via MediaPipe Tasks Vision (HandLandmarker): 21 landmarks
// per hand, up to two hands, running in-browser on WASM/GPU. Loaded lazily from
// CDN the first time the camera starts, so the page costs nothing until used and
// degrades silently offline (the caller falls back to frame-difference motion).
//
// Conventions followed (see project notes):
//   • EMA smoothing (0.7) applied to landmarks BEFORE any use; normalize after.
//   • Finger state from JOINT ANGLES, not bare distances.
//   • Hysteresis on the pinch threshold + a minimum hold time to debounce.
//   • Named landmark constants; structured gesture state, not raw tuples.
//   • Every MediaPipe call wrapped so a missing hand can't crash the loop.

window.MindfulHands = (function () {
  "use strict";

  // MediaPipe's 21-point model.
  const LM = {
    WRIST: 0,
    THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
    INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
    MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
    RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
    PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
  };
  // [mcp, pip, tip] per finger, for angle-based extension tests.
  const FINGERS = [
    { mcp: LM.INDEX_MCP, pip: LM.INDEX_PIP, tip: LM.INDEX_TIP },
    { mcp: LM.MIDDLE_MCP, pip: LM.MIDDLE_PIP, tip: LM.MIDDLE_TIP },
    { mcp: LM.RING_MCP, pip: LM.RING_PIP, tip: LM.RING_TIP },
    { mcp: LM.PINKY_MCP, pip: LM.PINKY_PIP, tip: LM.PINKY_TIP },
  ];
  const PALM = [LM.WRIST, LM.INDEX_MCP, LM.MIDDLE_MCP, LM.RING_MCP, LM.PINKY_MCP];

  const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
  const WASM = CDN + "/wasm";
  const MODEL =
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

  // Tunables.
  const SMOOTH = 0.7;          // EMA factor (higher = smoother, more lag)
  const EXTEND_ANGLE = 158;    // PIP angle (deg) above which a finger is "extended"
  const PINCH_ON = 0.42;       // thumb–index distance / hand size to engage a pinch
  const PINCH_OFF = 0.62;      //   ...and to release it again (hysteresis gap)
  const HOLD = 5;              // frames a gesture must persist before it commits
  const ZOOM_NEAR = 0.18, ZOOM_FAR = 0.55;   // inter-hand distance → zoom range
  const ZOOM_MIN = 0.6, ZOOM_MAX = 2.4;

  let landmarker = null;
  let running = false;
  let raf = 0;
  let video = null;
  let cbs = {};
  let lastVideoTime = -1;

  // Per-hand smoothed landmark arrays (index 0 = primary hand).
  let smooth = [null, null];
  let zoomEMA = null;
  // Structured gesture state (not raw tuples).
  let pinch = { active: false, frames: 0 };
  let fist = { frames: 0, fired: false };

  // ---- Small vector helpers (normalized image space, 0..1) ----
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Angle (deg) at joint b formed by a–b–c.
  function angleAt(a, b, c) {
    const v1x = a.x - b.x, v1y = a.y - b.y;
    const v2x = c.x - b.x, v2y = c.y - b.y;
    const d = (v1x * v2x + v1y * v2y) /
      ((Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y)) || 1e-6);
    return (Math.acos(clamp(d, -1, 1)) * 180) / Math.PI;
  }

  const fingerExtended = (lm, f) => angleAt(lm[f.mcp], lm[f.pip], lm[f.tip]) > EXTEND_ANGLE;
  // Scale reference so distance thresholds are independent of how close the hand is.
  const handSize = (lm) => dist(lm[LM.WRIST], lm[LM.MIDDLE_MCP]) || 1e-6;

  function centroid(lm, ids) {
    let x = 0, y = 0;
    for (const i of ids) { x += lm[i].x; y += lm[i].y; }
    return { x: x / ids.length, y: y / ids.length };
  }

  // EMA smoothing of a whole landmark array. Runs BEFORE any use of the points.
  function emaHand(prev, next) {
    if (!prev) return next.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    return next.map((p, i) => ({
      x: SMOOTH * prev[i].x + (1 - SMOOTH) * p.x,
      y: SMOOTH * prev[i].y + (1 - SMOOTH) * p.y,
      z: SMOOTH * prev[i].z + (1 - SMOOTH) * p.z,
    }));
  }

  async function init() {
    if (landmarker) return true;
    let vision;
    try {
      vision = await import(/* webpackIgnore: true */ CDN);
    } catch (e) {
      console.warn("MindfulHands: could not load MediaPipe —", e && e.message);
      return false;
    }
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
    // Try GPU first; fall back to CPU if this context can't provide it.
    for (const delegate of ["GPU", "CPU"]) {
      try {
        landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: "VIDEO",
          numHands: 2,
        });
        return true;
      } catch (e) {
        console.warn(`MindfulHands: ${delegate} delegate failed —`, e && e.message);
      }
    }
    return false;
  }

  function emitFromPrimary(lm) {
    const hs = handSize(lm);

    // --- Pinch (thumb tip ↔ index tip), angle-validated, with hysteresis ---
    const pinchD = dist(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]) / hs;
    const wantActive = pinch.active ? pinchD <= PINCH_OFF : pinchD <= PINCH_ON;
    if (wantActive !== pinch.active) {
      pinch.frames++;
      if (pinch.frames >= HOLD) {            // debounce the transition
        pinch.active = wantActive;
        pinch.frames = 0;
        if (pinch.active && cbs.onPinch) {
          // hand pointer = index tip, mirrored for the selfie view
          cbs.onPinch(1 - lm[LM.INDEX_TIP].x, lm[LM.INDEX_TIP].y);
        }
      }
    } else {
      pinch.frames = 0;
    }

    // --- Fist (no finger extended) → fires once per closure, debounced ---
    const isFist = FINGERS.every((f) => !fingerExtended(lm, f));
    if (isFist) {
      fist.frames++;
      if (fist.frames >= HOLD && !fist.fired) {
        fist.fired = true;
        if (cbs.onFist) cbs.onFist();
      }
    } else {
      fist.frames = 0;
      fist.fired = false;
    }
  }

  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (!landmarker || !video || video.readyState < 2) return;

    const now = performance.now();
    if (video.currentTime === lastVideoTime) return; // no new frame yet (~caps work)
    lastVideoTime = video.currentTime;

    let res;
    try {
      res = landmarker.detectForVideo(video, now);
    } catch {
      return; // hand-not-detected / transient error must never crash the loop
    }

    const hands = (res && res.landmarks) || [];
    if (hands.length === 0) {
      smooth = [null, null];
      if (cbs.onHands) cbs.onHands(0);
      return;
    }

    // Smooth each hand before use, then work in normalized space.
    const sm = hands.map((lm, i) => (smooth[i] = emaHand(smooth[i], lm)));
    if (cbs.onHands) cbs.onHands(sm.length);

    const palms = sm.map((lm) => centroid(lm, PALM));

    // Pan from the (mean) palm position; mirror X so moving right pans right.
    const panPt = palms.length >= 2
      ? { x: (palms[0].x + palms[1].x) / 2, y: (palms[0].y + palms[1].y) / 2 }
      : palms[0];
    if (cbs.onPan) cbs.onPan(((1 - panPt.x) - 0.5) * 2, (panPt.y - 0.5) * 2);

    // Zoom from how far apart two hands are: spread to zoom in, together to out.
    if (palms.length >= 2) {
      const d = dist(palms[0], palms[1]);
      zoomEMA = zoomEMA == null ? d : SMOOTH * zoomEMA + (1 - SMOOTH) * d;
      const t = (zoomEMA - ZOOM_NEAR) / (ZOOM_FAR - ZOOM_NEAR);
      if (cbs.onZoom) cbs.onZoom(clamp(ZOOM_MIN + t * (ZOOM_MAX - ZOOM_MIN), 0.5, 2.6));
    } else {
      zoomEMA = null;
    }

    emitFromPrimary(sm[0]);
  }

  return {
    // Begin tracking on a playing <video>. Resolves false if MediaPipe can't
    // load (offline / unsupported) so the caller can fall back.
    async start(videoEl, callbacks) {
      video = videoEl;
      cbs = callbacks || {};
      const ok = await init();
      if (!ok) return false;
      running = true;
      smooth = [null, null];
      zoomEMA = null;
      lastVideoTime = -1;
      pinch = { active: false, frames: 0 };
      fist = { frames: 0, fired: false };
      loop();
      return true;
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    get active() {
      return running && !!landmarker;
    },
  };
})();

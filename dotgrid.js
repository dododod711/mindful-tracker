// dotgrid.js — interactive dot-grid background.
// A dependency-free canvas port of the Reactbits <DotGrid> component: dots tint
// toward activeColor near the pointer, get shoved in the direction of fast
// movement, and radiate outward from a click — then spring back to rest.
// Pointer events are bound to the window so the grid reacts behind page content.
(function () {
  const canvas = document.getElementById("dot-bg");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Defaults mirror the component props; any can be overridden with data-* attrs.
  const cfg = {
    dotSize: 5,
    gap: 15,
    baseColor: "#2F293A",
    activeColor: "#5227FF",
    proximity: 120,
    speedTrigger: 100,
    shockRadius: 250,
    shockStrength: 5,
    maxSpeed: 5000,
    resistance: 750,
    returnDuration: 1.5,
  };
  for (const key in cfg) {
    const v = canvas.dataset[key];
    if (v !== undefined) cfg[key] = isNaN(+v) ? v : +v;
  }

  const toRGB = (hex) => {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  // Prefer the --dot-base / --dot-active CSS variables so the grid tracks the
  // theme (and light/dark mode); fall back to the configured defaults.
  const cssVar = (name, fallback) => {
    const v = getComputedStyle(canvas).getPropertyValue(name).trim();
    return v || fallback;
  };
  const base = toRGB(cssVar("--dot-base", cfg.baseColor));
  const active = toRGB(cssVar("--dot-active", cfg.activeColor));

  let dots = [];
  let W = 0;
  let H = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function build() {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    dots = [];
    const step = cfg.gap + cfg.dotSize;
    const cols = Math.max(Math.floor((W + cfg.gap) / step), 1);
    const rows = Math.max(Math.floor((H + cfg.gap) / step), 1);
    const startX = (W - (cols - 1) * step) / 2;
    const startY = (H - (rows - 1) * step) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ox = startX + c * step;
        const oy = startY + r * step;
        dots.push({ ox, oy, x: ox, y: oy, vx: 0, vy: 0 });
      }
    }
  }

  const pointer = { x: -9999, y: -9999, px: -9999, py: -9999, speed: 0, t: 0 };

  function onMove(e) {
    const now = performance.now();
    const dt = Math.max(now - pointer.t, 1);
    pointer.t = now;
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    pointer.x = e.clientX;
    pointer.y = e.clientY;

    const dx = pointer.x - pointer.px;
    const dy = pointer.y - pointer.py;
    const moved = Math.hypot(dx, dy);
    pointer.speed = Math.min((moved / dt) * 1000, cfg.maxSpeed);

    // Gently nudge nearby dots along the direction of travel when moving fast.
    if (pointer.speed > cfg.speedTrigger && pointer.px > -9000 && moved > 0) {
      const ux = dx / moved;
      const uy = dy / moved;
      for (const d of dots) {
        const dist = Math.hypot(d.ox - pointer.x, d.oy - pointer.y);
        if (dist < cfg.proximity) {
          const push = (1 - dist / cfg.proximity) * (pointer.speed / cfg.resistance) * 0.5;
          d.vx += ux * push;
          d.vy += uy * push;
        }
      }
    }
  }

  function onClick(e) {
    for (const d of dots) {
      const dx = d.ox - e.clientX;
      const dy = d.oy - e.clientY;
      const dist = Math.hypot(dx, dy);
      if (dist < cfg.shockRadius) {
        const dir = dist || 1;
        const force = (1 - dist / cfg.shockRadius) * cfg.shockStrength * 1.5;
        d.vx += (dx / dir) * force;
        d.vy += (dy / dir) * force;
      }
    }
  }

  // Near-critically damped spring: dots ease back with barely any bounce.
  const stiffness = (1 / (cfg.returnDuration * cfg.returnDuration)) * 60;
  const damping = 2 * Math.sqrt(stiffness) * 0.92;
  const MAX_V = 18;

  function frame() {
    ctx.clearRect(0, 0, W, H);
    for (const d of dots) {
      const ax = -stiffness * (d.x - d.ox) - damping * d.vx;
      const ay = -stiffness * (d.y - d.oy) - damping * d.vy;
      d.vx = Math.max(-MAX_V, Math.min(MAX_V, d.vx + ax * 0.016));
      d.vy = Math.max(-MAX_V, Math.min(MAX_V, d.vy + ay * 0.016));
      d.x += d.vx;
      d.y += d.vy;

      let col = base;
      const dist = Math.hypot(d.ox - pointer.x, d.oy - pointer.y);
      if (dist < cfg.proximity) {
        const t = 1 - dist / cfg.proximity;
        col = [
          base[0] + (active[0] - base[0]) * t,
          base[1] + (active[1] - base[1]) * t,
          base[2] + (active[2] - base[2]) * t,
        ];
      }
      ctx.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, cfg.dotSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }

  build();
  window.addEventListener("resize", build);
  if (!reduceMotion) {
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("click", onClick);
  }
  requestAnimationFrame(frame);
})();

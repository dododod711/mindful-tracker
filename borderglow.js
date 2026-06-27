// borderglow.js — a dependency-free port of the Reactbits <BorderGlow>.
// Any element with class "border-glow" gets a cursor-reactive edge glow: as the
// pointer nears an edge, a soft coloured light blooms along that edge, pointing
// toward the cursor. All the visuals live in CSS (see .border-glow rules); this
// just tracks the pointer and feeds two custom properties:
//   --edge-proximity : 0–100, how close the pointer is to the nearest edge
//   --cursor-angle   : the direction from the card's centre to the pointer
(function () {
  function center(el) {
    const r = el.getBoundingClientRect();
    return [r.width / 2, r.height / 2];
  }

  function edgeProximity(el, x, y) {
    const [cx, cy] = center(el);
    const dx = x - cx;
    const dy = y - cy;
    let kx = Infinity;
    let ky = Infinity;
    if (dx !== 0) kx = cx / Math.abs(dx);
    if (dy !== 0) ky = cy / Math.abs(dy);
    return Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
  }

  function cursorAngle(el, x, y) {
    const [cx, cy] = center(el);
    const dx = x - cx;
    const dy = y - cy;
    if (dx === 0 && dy === 0) return 0;
    let deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (deg < 0) deg += 360;
    return deg;
  }

  function attach(card) {
    // The outer-glow layer is a dedicated child so it can extend beyond the card.
    if (!card.querySelector(":scope > .edge-light")) {
      const span = document.createElement("span");
      span.className = "edge-light";
      span.setAttribute("aria-hidden", "true");
      card.insertBefore(span, card.firstChild);
    }
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      card.style.setProperty("--edge-proximity", (edgeProximity(card, x, y) * 100).toFixed(2));
      card.style.setProperty("--cursor-angle", cursorAngle(card, x, y).toFixed(2) + "deg");
    });
  }

  function init() {
    document.querySelectorAll(".border-glow").forEach(attach);
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();

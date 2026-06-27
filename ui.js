// ===== Lumen — small UI helpers =====
// Keeps each slider's --fill custom prop in sync so the track shows a
// sage fill up to the current value. Purely decorative.

function updateFill(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const pct = ((input.value - min) / (max - min)) * 100;
  input.style.setProperty("--fill", `${pct}%`);
}

for (const input of document.querySelectorAll('input[type="range"]')) {
  updateFill(input); // reflect prefilled values from today's check-in
  input.addEventListener("input", () => updateFill(input));
}

// A slim reading-progress bar along the very top, and a touch of depth on the
// sticky header once you've scrolled. Both are decorative and unobtrusive.
(function () {
  const bar = document.createElement("div");
  bar.className = "scroll-progress";
  bar.setAttribute("aria-hidden", "true");
  const fill = document.createElement("div");
  fill.className = "scroll-progress-bar";
  bar.appendChild(fill);
  document.body.appendChild(bar);

  let ticking = false;
  function update() {
    ticking = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 4 ? Math.min((window.scrollY / max) * 100, 100) : 0;
    fill.style.width = pct + "%";
    document.body.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true }
  );
  addEventListener("resize", update);
  update();
})();

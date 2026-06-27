// tour.js — optional, opt-in website walkthrough. A dependency-free port of the
// Reactbits <Stepper>: clickable step indicators, Back/Next navigation, and a
// final "Done". Opens from the "Take a tour" button, and once on a first visit.
(function () {
  const ICON = {
    spark: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c.5 4 1.5 5 6 6-4.5 1-5.5 2-6 6-.5-4-1.5-5-6-6 4.5-1 5.5-2 6-6z"/></svg>',
    pencil: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    chart: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5v14h16"/><path d="M7 14l3.5-4 3 2L20 6"/></svg>',
    planet: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><ellipse cx="12" cy="12" rx="10" ry="3.6" transform="rotate(-25 12 12)"/></svg>',
    lock: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  };
  const steps = [
    {
      icon: ICON.spark,
      title: "Welcome to Lumen",
      text: "A calm, private space to check in with how you're doing. Here's a quick tour — you can skip it anytime.",
    },
    {
      icon: ICON.pencil,
      title: "Check-in & Journal",
      text: "Log your mood, sleep, energy and stress in seconds, then journal freely. One entry per day, saved right on your device.",
    },
    {
      icon: ICON.chart,
      title: "Insights & Support",
      text: "See your weekly trends, get gentle advice drawn from your own journal, and try calming tools like box breathing and 5-4-3-2-1 grounding.",
    },
    {
      icon: ICON.planet,
      title: "Stargaze",
      text: "Your notes become a slowly breathing planet of stars you can steer with your hand or cursor — a moment to slow down and reset.",
    },
    {
      icon: ICON.lock,
      title: "Private by default",
      text: "Everything lives in this browser. No account, nothing leaves your device — and you can export a backup whenever you like.",
    },
  ];
  const SEEN_KEY = "mindful-tour-seen";

  let overlay, dotsWrap, iconEl, titleEl, textEl, backBtn, nextBtn, lastFocus;
  let current = 0;

  function build() {
    overlay = document.createElement("div");
    overlay.className = "tour-overlay";
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="tour-card" role="dialog" aria-modal="true" aria-label="Website tour">' +
      '<button class="tour-close" type="button" aria-label="Close tour">×</button>' +
      '<div class="tour-dots"></div>' +
      '<div class="tour-body"><div class="tour-icon"></div><h2 class="tour-title"></h2><p class="tour-text"></p></div>' +
      '<div class="tour-nav"><button class="tour-back btn-ghost" type="button">Previous</button>' +
      '<button class="tour-next btn-primary" type="button">Next</button></div>' +
      "</div>";
    document.body.appendChild(overlay);

    dotsWrap = overlay.querySelector(".tour-dots");
    iconEl = overlay.querySelector(".tour-icon");
    titleEl = overlay.querySelector(".tour-title");
    textEl = overlay.querySelector(".tour-text");
    backBtn = overlay.querySelector(".tour-back");
    nextBtn = overlay.querySelector(".tour-next");

    steps.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "tour-dot";
      dot.setAttribute("aria-label", "Go to step " + (i + 1));
      dot.addEventListener("click", () => go(i));
      dotsWrap.appendChild(dot);
    });

    overlay.querySelector(".tour-close").addEventListener("click", () => close());
    backBtn.addEventListener("click", () => go(current - 1));
    nextBtn.addEventListener("click", () => {
      if (current === steps.length - 1) close();
      else go(current + 1);
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", (e) => {
      if (overlay.hidden) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" && current < steps.length - 1) go(current + 1);
      else if (e.key === "ArrowLeft" && current > 0) go(current - 1);
    });
  }

  function render() {
    const s = steps[current];
    iconEl.innerHTML = s.icon;
    titleEl.textContent = s.title;
    textEl.textContent = s.text;
    backBtn.disabled = current === 0;
    nextBtn.textContent = current === steps.length - 1 ? "Done" : "Next";
    [...dotsWrap.children].forEach((d, i) => {
      d.classList.toggle("active", i === current);
      d.classList.toggle("done", i < current);
    });
  }

  function go(i) {
    current = Math.max(0, Math.min(steps.length - 1, i));
    render();
  }

  function open() {
    lastFocus = document.activeElement;
    current = 0;
    render();
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    nextBtn.focus();
  }

  function close() {
    overlay.hidden = true;
    document.body.style.overflow = "";
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch (e) {}
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  build();
  const starter = document.getElementById("tour-start");
  if (starter) starter.addEventListener("click", open);

  // Auto-open once on a visitor's first arrival — whichever page they land on —
  // after a short beat. Mark it seen the moment it opens so it never pops again
  // as they move around the site.
  let seen = false;
  try {
    seen = localStorage.getItem(SEEN_KEY) === "1";
  } catch (e) {}
  if (!seen) {
    setTimeout(() => {
      try { localStorage.setItem(SEEN_KEY, "1"); } catch (e) {}
      open();
    }, 900);
  }
})();

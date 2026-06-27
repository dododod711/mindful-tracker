// tour.js — the opt-in walkthrough, presented as a ScrollStack (see
// scrollstack.js): the steps are full cards that pin and scale as you scroll
// through them. Opens from the "Take a tour" button and once on a first visit.
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
      text: "A calm, private space to check in with how you're doing. Scroll through this quick tour — you can close it anytime.",
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
      text: "Your notes become a slowly breathing planet of stars you can steer with your hand or cursor — each one glows in that day's mood.",
    },
    {
      icon: ICON.lock,
      title: "Private by default",
      text: "Everything lives in this browser. No account, nothing leaves your device — and you can export a backup whenever you like.",
    },
  ];
  const SEEN_KEY = "mindful-tour-seen";

  let overlay, scroller, closeBtn, lastFocus, stack;

  function build() {
    overlay = document.createElement("div");
    overlay.className = "tour-stack-overlay";
    overlay.hidden = true;

    const cards = steps
      .map(
        (s) =>
          '<div class="scroll-stack-card">' +
          '<div class="tour-card-icon">' + s.icon + "</div>" +
          "<h2>" + s.title + "</h2>" +
          "<p>" + s.text + "</p>" +
          "</div>"
      )
      .join("");

    overlay.innerHTML =
      '<button class="tour-stack-close" type="button" aria-label="Close tour">×</button>' +
      '<div class="scroll-stack-scroller" role="dialog" aria-modal="true" aria-label="Website tour">' +
      '<div class="scroll-stack-inner">' +
      cards +
      '<div class="scroll-stack-card tour-card-final">' +
      "<h2>You’re all set</h2>" +
      "<p>That’s the tour. Everything stays on your device — start wherever feels right.</p>" +
      '<button class="btn-primary tour-stack-done" type="button">Start exploring</button>' +
      "</div>" +
      '<div class="scroll-stack-end"></div>' +
      "</div></div>";

    document.body.appendChild(overlay);
    scroller = overlay.querySelector(".scroll-stack-scroller");
    closeBtn = overlay.querySelector(".tour-stack-close");

    closeBtn.addEventListener("click", close);
    overlay.querySelector(".tour-stack-done").addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (!overlay.hidden && e.key === "Escape") close();
    });
  }

  function open() {
    lastFocus = document.activeElement;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    scroller.scrollTop = 0;
    // Init once the overlay is laid out so card offsets are measurable.
    if (window.ScrollStack) {
      if (!stack) {
        stack = window.ScrollStack.init(scroller, {
          baseScale: 0.86,
          itemScale: 0.035,
          itemDistance: 80,
          itemStackDistance: 26,
          stackPosition: "16%",
          scaleEndPosition: "6%",
        });
      } else {
        stack.update();
      }
    }
    closeBtn.focus();
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

  // Auto-open once on a visitor's first arrival; mark seen the moment it opens
  // so it never pops again as they move around the site.
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

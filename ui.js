// ===== Mindful — small UI helpers =====
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

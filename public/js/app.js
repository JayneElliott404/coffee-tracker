document.addEventListener('submit', (event) => {
  const message = event.target.dataset.confirm;
  if (message && !window.confirm(message)) event.preventDefault();
});

document.querySelectorAll('input[data-output]').forEach((input) => {
  const output = document.getElementById(input.dataset.output);
  if (!output) return;
  input.addEventListener('input', () => {
    output.textContent = input.value;
  });
});

// Inline style attributes are blocked by the Content Security Policy, so widths are applied here.
document.querySelectorAll('.bar-fill[data-width]').forEach((bar) => {
  bar.style.width = `${bar.dataset.width}%`;
});

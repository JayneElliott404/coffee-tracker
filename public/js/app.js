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

document.querySelectorAll('[data-password-toggle]').forEach((button) => {
  const input = document.getElementById(button.dataset.passwordToggle);
  if (!input) return;
  const icon = button.querySelector('i');
  button.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(show));
    button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    icon.className = show ? 'bi bi-eye-slash' : 'bi bi-eye';
  });
});

// The native cross on a search input fires "search" with an empty value; re-run the query with the remaining filters.
document.querySelectorAll('form[role="search"] input[type="search"]').forEach((input) => {
  input.addEventListener('search', () => {
    if (input.value === '') input.form.requestSubmit();
  });
});

// Inline style attributes are blocked by the Content Security Policy, so widths are applied here.
document.querySelectorAll('.bar-fill[data-width]').forEach((bar) => {
  bar.style.width = `${bar.dataset.width}%`;
});

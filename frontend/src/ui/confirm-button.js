const CONFIRM_TIMEOUT_MS = 4000;

/**
 * Confirmation en deux clics dans le bouton lui-même, à la place de
 * window.confirm() — bloquant, impossible à styliser, et contraire à la
 * règle du projet de n'utiliser que des messages intégrés à la page.
 *
 * Premier clic : le bouton passe en état "à confirmer" (libellé et
 * aria-label explicites) ; second clic dans le délai : onConfirm(). Sans
 * second clic, ou si le focus quitte le bouton, il revient à son état initial.
 *
 * @param {HTMLButtonElement} button
 * @param {{ confirmLabel: string, confirmAriaLabel: string, onConfirm: () => void | Promise<void> }} options
 */
export function withInlineConfirmation(button, { confirmLabel, confirmAriaLabel, onConfirm }) {
  const initial = {
    text: button.textContent,
    ariaLabel: button.getAttribute("aria-label"),
    title: button.title,
  };
  let armed = false;
  let timer = null;

  function disarm() {
    armed = false;
    clearTimeout(timer);
    button.classList.remove("confirm-pending");
    button.textContent = initial.text;
    button.title = initial.title;
    if (initial.ariaLabel === null) button.removeAttribute("aria-label");
    else button.setAttribute("aria-label", initial.ariaLabel);
  }

  button.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!armed) {
      armed = true;
      button.classList.add("confirm-pending");
      button.textContent = confirmLabel;
      button.title = confirmAriaLabel;
      button.setAttribute("aria-label", confirmAriaLabel);
      timer = setTimeout(disarm, CONFIRM_TIMEOUT_MS);
      return;
    }
    disarm();
    await onConfirm();
  });
  button.addEventListener("blur", () => {
    if (armed) disarm();
  });
}

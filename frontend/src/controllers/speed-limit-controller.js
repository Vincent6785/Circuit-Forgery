const DEFAULT_KMH = 80;
const DEBOUNCE_MS = 400;

/** Câble le panneau "Limite de vitesse" : un seuil personnalisé (20-80,
 * resserre le filtre par défaut) ou la case "Aucune limite" (bascule sur le
 * profil GraphHopper `moto_no_limit`, sans exclusion de vitesse — abaisser
 * le seuil se fait par requête, mais le relever au-delà de 80 nécessite un
 * profil différent, préparé à l'avance ; cf. services/avoid_zone.py côté
 * backend). Notifie le store en mode non-silencieux comme les autres
 * réglages de trajet, ce qui déclenche le recalcul automatique déjà branché
 * dans route-controller.js — aucun câblage supplémentaire nécessaire ici. */
export function initSpeedLimitController({ store }) {
  const input = document.getElementById("speed-limit-input");
  const checkbox = document.getElementById("speed-limit-none-checkbox");
  let debounceTimer = null;

  function parseInputValue() {
    const v = parseFloat(input.value);
    if (!Number.isFinite(v) || v >= DEFAULT_KMH) return null;
    return Math.max(20, v);
  }

  // "input" plutôt que "change" : déclenché de façon fiable aussi bien par
  // une frappe clavier que par une valeur posée par script (tests
  // automatisés notamment) — contrairement à "change" sur un input number,
  // dont le déclenchement s'est avéré peu fiable selon la façon dont la
  // valeur est posée. Débounce pour ne pas recalculer à chaque chiffre tapé.
  input.addEventListener("input", () => {
    if (checkbox.checked) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      store.setState({ speedLimitKmh: parseInputValue(), noSpeedLimit: false }, { silent: false });
    }, DEBOUNCE_MS);
  });

  checkbox.addEventListener("change", () => {
    clearTimeout(debounceTimer);
    const noSpeedLimit = checkbox.checked;
    store.setState(
      { speedLimitKmh: noSpeedLimit ? null : parseInputValue(), noSpeedLimit },
      { silent: false }
    );
  });

  store.subscribe((state) => {
    // Ne réécrit pas la valeur pendant que l'utilisateur a le focus dessus :
    // une notification de store sans rapport (ex. un recalcul de trajet qui
    // se termine) pourrait sinon écraser une frappe en cours pendant le
    // débounce ci-dessus.
    if (document.activeElement !== input) {
      input.value = state.speedLimitKmh ?? DEFAULT_KMH;
    }
    input.disabled = state.noSpeedLimit;
    checkbox.checked = state.noSpeedLimit;
  });
}

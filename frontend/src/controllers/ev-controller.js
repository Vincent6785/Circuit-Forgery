import {
  DEFAULT_EV_SETTINGS,
  chargePercentPerStop,
  evSettingsError,
  joinChargeSpeed,
  splitChargeSpeed,
} from "../utils/ev.js";
import { formatDuration } from "../ui/sidebar.js";

const DEBOUNCE_MS = 400;

/** Câble le panneau "Véhicule électrique" des options du trajet : autonomie,
 * distance entre deux recharges, vitesse de recharge.
 *
 * Comme les autres réglages de trajet (limite de vitesse, zones à éviter),
 * toute modification notifie le store en mode non-silencieux, ce qui
 * déclenche le recalcul déjà branché dans route-controller.js — c'est lui
 * qui transmet ces réglages à /api/routes/compute, et le backend qui place
 * les arrêts recharge. Rien à câbler ici pour la carte ou la liste.
 *
 * Les réglages survivent à la décoche : rebasculer en électrique retrouve
 * l'autonomie saisie plutôt que la valeur par défaut. */
export function initEvController({ store }) {
  const checkbox = document.getElementById("ev-enabled-checkbox");
  const settingsPanel = document.getElementById("ev-settings");
  const autonomyInput = document.getElementById("ev-autonomy-input");
  const intervalInput = document.getElementById("ev-interval-input");
  const minutesInput = document.getElementById("ev-charge-min-input");
  const secondsInput = document.getElementById("ev-charge-sec-input");
  const summary = document.getElementById("ev-summary");
  const inputs = [autonomyInput, intervalInput, minutesInput, secondsInput];

  let debounceTimer = null;

  /** Réglages décrits par les champs, sans passer par le store : la saisie
   * en cours peut être invalide, et ne doit alors pas déclencher de calcul. */
  function readInputs() {
    return {
      autonomyKm: parseFloat(autonomyInput.value),
      rechargeIntervalKm: parseFloat(intervalInput.value),
      secondsPerPercent: joinChargeSpeed(parseFloat(minutesInput.value) || 0, parseFloat(secondsInput.value) || 0),
    };
  }

  function renderSummary(settings, error) {
    if (error) {
      summary.textContent = error;
      summary.classList.add("error-hint");
      return;
    }
    const percent = chargePercentPerStop(settings);
    summary.classList.remove("error-hint");
    summary.textContent =
      `Chaque arrêt recharge ${percent.toFixed(0)} % de batterie, ` +
      `soit ${formatDuration(percent * settings.secondsPerPercent)} d'attente.`;
  }

  function commit() {
    const settings = readInputs();
    const error = evSettingsError(settings);
    renderSummary(settings, error);
    // Une saisie invalide est signalée sous les champs et n'est pas envoyée :
    // le backend la refuserait avec une erreur rouge, alors qu'il s'agit le
    // plus souvent d'un champ à moitié tapé.
    if (error) return;
    store.setState({ evSettings: settings }, { userChange: true });
  }

  for (const input of inputs) {
    // "input" : déclenché de façon fiable à la frappe comme pour une valeur
    // posée par script, contrairement à "change" seul (même constat que pour
    // le seuil de vitesse). Débounce pour ne pas recalculer à chaque chiffre.
    input.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(commit, DEBOUNCE_MS);
    });
    // Quitter le champ (ou valider par Entrée) écrit tout de suite, sans
    // attendre le débounce : contrairement au seuil de vitesse, ces réglages
    // sont enregistrés avec le trajet — saisir une autonomie puis cliquer
    // aussitôt sur "Sauvegarder" enregistrait la valeur précédente.
    input.addEventListener("change", () => {
      clearTimeout(debounceTimer);
      commit();
    });
  }

  checkbox.addEventListener("change", () => {
    clearTimeout(debounceTimer);
    store.setState({ evEnabled: checkbox.checked }, { userChange: true });
  });

  store.subscribe(
    (state) => {
      const settings = state.evSettings ?? DEFAULT_EV_SETTINGS;
      checkbox.checked = state.evEnabled;
      settingsPanel.classList.toggle("hidden", !state.evEnabled);

      // Ne réécrit pas un champ en cours de saisie : une notification sans
      // rapport (fin d'un recalcul) écraserait la frappe pendant le débounce.
      const { minutes, seconds } = splitChargeSpeed(settings.secondsPerPercent);
      const values = [
        [autonomyInput, settings.autonomyKm],
        [intervalInput, settings.rechargeIntervalKm],
        [minutesInput, minutes],
        [secondsInput, seconds],
      ];
      for (const [input, value] of values) {
        if (document.activeElement !== input && input.value !== String(value)) input.value = String(value);
      }
      renderSummary(settings, null);
    },
    { keys: ["evEnabled", "evSettings"] }
  );

  const state = store.getState();
  checkbox.checked = state.evEnabled;
  settingsPanel.classList.toggle("hidden", !state.evEnabled);
  renderSummary(state.evSettings ?? DEFAULT_EV_SETTINGS, null);
}

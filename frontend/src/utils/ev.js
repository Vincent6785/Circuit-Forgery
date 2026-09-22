// @ts-check

/**
 * @typedef {object} EvSettings
 * @property {number} autonomyKm Autonomie à batterie pleine.
 * @property {number} rechargeIntervalKm Distance souhaitée entre deux recharges.
 * @property {number} secondsPerPercent Temps pour regagner 1 % de batterie.
 *
 * @typedef {{ autonomy_km: number, recharge_interval_km: number, seconds_per_percent: number }} ApiEvSettings
 */

/** Réglages par défaut : 20 km entre deux recharges et 1 min 30 par pourcent
 * sont les valeurs demandées ; l'autonomie n'a pas de défaut évident (elle
 * dépend de la machine), 100 km est un ordre de grandeur courant pour une
 * moto électrique et reste modifiable. */
export const DEFAULT_EV_SETTINGS = {
  autonomyKm: 100,
  rechargeIntervalKm: 20,
  secondsPerPercent: 90,
};

export const MAX_AUTONOMY_KM = 2000;
export const MAX_SECONDS_PER_PERCENT = 3600;

/** Passe les réglages du format JS au format attendu par l'API, ou null
 * quand le mode électrique est désactivé — le backend ne cherche alors
 * aucune borne.
 *
 * @param {boolean} enabled
 * @param {EvSettings} settings
 * @returns {ApiEvSettings | null}
 */
export function toApiEv(enabled, settings) {
  if (!enabled) return null;
  return {
    autonomy_km: settings.autonomyKm,
    recharge_interval_km: settings.rechargeIntervalKm,
    seconds_per_percent: settings.secondsPerPercent,
  };
}

/** Sens inverse, pour recharger un trajet sauvegardé. Renvoie null si le
 * trajet n'a pas de réglage électrique (trajet thermique, ou enregistré avant
 * l'existence du mode).
 *
 * @param {ApiEvSettings | null | undefined} ev
 * @returns {EvSettings | null}
 */
export function fromApiEv(ev) {
  if (!ev) return null;
  return {
    autonomyKm: ev.autonomy_km,
    rechargeIntervalKm: ev.recharge_interval_km,
    secondsPerPercent: ev.seconds_per_percent,
  };
}

/** Pourcentage rechargé à chaque arrêt : la part d'autonomie consommée par
 * l'intervalle parcouru. Miroir de `charge_percent` côté backend
 * (services/charging_plan.py), utilisé ici pour afficher le réglage avant
 * même qu'un trajet soit calculé.
 *
 * @param {EvSettings} settings
 */
export function chargePercentPerStop({ autonomyKm, rechargeIntervalKm }) {
  if (!(autonomyKm > 0)) return 0;
  return Math.min(100, (rechargeIntervalKm / autonomyKm) * 100);
}

/** Message d'erreur si les réglages décrivent un trajet impossible, null
 * sinon. Le backend refuse le même cas ; le vérifier ici évite un
 * aller-retour et une erreur rouge pour une simple faute de saisie.
 *
 * @param {EvSettings} settings
 * @returns {string | null}
 */
export function evSettingsError({ autonomyKm, rechargeIntervalKm, secondsPerPercent }) {
  if (!(autonomyKm > 0) || autonomyKm > MAX_AUTONOMY_KM) {
    return `Autonomie invalide (1 à ${MAX_AUTONOMY_KM} km).`;
  }
  if (!(rechargeIntervalKm > 0) || rechargeIntervalKm > MAX_AUTONOMY_KM) {
    return `Intervalle de recharge invalide (1 à ${MAX_AUTONOMY_KM} km).`;
  }
  if (!(secondsPerPercent > 0) || secondsPerPercent > MAX_SECONDS_PER_PERCENT) {
    return "Vitesse de recharge invalide (entre 1 s et 1 h pour 1 %).";
  }
  if (rechargeIntervalKm > autonomyKm) {
    return "L'intervalle de recharge dépasse l'autonomie : la batterie serait vide avant la borne suivante.";
  }
  return null;
}

/** Durée "1 % en X min Y s" découpée pour les deux champs de saisie.
 * @param {number} secondsPerPercent */
export function splitChargeSpeed(secondsPerPercent) {
  const total = Math.max(0, Math.round(secondsPerPercent));
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}

/** Recomposition inverse.
 * @param {number} minutes
 * @param {number} seconds */
export function joinChargeSpeed(minutes, seconds) {
  return Math.max(0, Math.round(minutes)) * 60 + Math.max(0, Math.round(seconds));
}

import { describe, it, expect } from "vitest";
import {
  DEFAULT_EV_SETTINGS,
  chargePercentPerStop,
  evSettingsError,
  fromApiEv,
  joinChargeSpeed,
  splitChargeSpeed,
  toApiEv,
} from "../../src/utils/ev.js";
import { chargingSummaryText } from "../../src/ui/charging-stop-list.js";
import { chargingStopLines } from "../../src/utils/charging-stop.js";

describe("réglages par défaut", () => {
  it("recharge tous les 20 km, 1 min 30 par pourcent", () => {
    expect(DEFAULT_EV_SETTINGS.rechargeIntervalKm).toBe(20);
    expect(DEFAULT_EV_SETTINGS.secondsPerPercent).toBe(90);
  });
});

describe("toApiEv / fromApiEv", () => {
  it("n'envoie rien quand le mode électrique est décoché", () => {
    expect(toApiEv(false, DEFAULT_EV_SETTINGS)).toBeNull();
  });

  it("fait l'aller-retour avec le format de l'API", () => {
    const settings = { autonomyKm: 140, rechargeIntervalKm: 35, secondsPerPercent: 75 };
    const api = toApiEv(true, settings);
    expect(api).toEqual({ autonomy_km: 140, recharge_interval_km: 35, seconds_per_percent: 75 });
    expect(fromApiEv(api)).toEqual(settings);
  });

  it("lit un trajet sauvegardé sans réglage électrique comme thermique", () => {
    expect(fromApiEv(null)).toBeNull();
    expect(fromApiEv(undefined)).toBeNull();
  });
});

describe("chargePercentPerStop", () => {
  it("rapporte l'intervalle à l'autonomie", () => {
    expect(chargePercentPerStop({ autonomyKm: 100, rechargeIntervalKm: 20 })).toBe(20);
  });

  it("ne dépasse jamais une batterie pleine", () => {
    expect(chargePercentPerStop({ autonomyKm: 50, rechargeIntervalKm: 50 })).toBe(100);
  });

  it("ne divise pas par une autonomie nulle", () => {
    expect(chargePercentPerStop({ autonomyKm: 0, rechargeIntervalKm: 20 })).toBe(0);
  });
});

describe("evSettingsError", () => {
  const valid = { autonomyKm: 100, rechargeIntervalKm: 20, secondsPerPercent: 90 };

  it("accepte des réglages cohérents", () => {
    expect(evSettingsError(valid)).toBeNull();
    expect(evSettingsError({ ...valid, rechargeIntervalKm: 100 })).toBeNull();
  });

  it("refuse un intervalle au-delà de l'autonomie", () => {
    // Même règle que le backend (services/charging_plan.py::validate_ev) :
    // la vérifier ici évite un aller-retour et un bandeau rouge pour une
    // simple faute de saisie.
    expect(evSettingsError({ ...valid, rechargeIntervalKm: 150 })).toMatch(/autonomie/);
  });

  it("refuse les valeurs vides ou absurdes", () => {
    expect(evSettingsError({ ...valid, autonomyKm: NaN })).toMatch(/Autonomie/);
    expect(evSettingsError({ ...valid, rechargeIntervalKm: 0 })).toMatch(/Intervalle/);
    expect(evSettingsError({ ...valid, secondsPerPercent: 0 })).toMatch(/recharge/);
    expect(evSettingsError({ ...valid, secondsPerPercent: 7200 })).toMatch(/recharge/);
  });
});

describe("vitesse de recharge en min/s", () => {
  it("découpe et recompose 1 min 30", () => {
    expect(splitChargeSpeed(90)).toEqual({ minutes: 1, seconds: 30 });
    expect(joinChargeSpeed(1, 30)).toBe(90);
  });

  it("tolère des valeurs négatives ou décimales", () => {
    expect(splitChargeSpeed(-5)).toEqual({ minutes: 0, seconds: 0 });
    expect(joinChargeSpeed(-1, 45)).toBe(45);
  });
});

describe("chargingSummaryText", () => {
  const base = { chargingDurationS: 3600, unplaced: 0, unavailable: false, maxGapM: 20500, intervalKm: 20 };

  it("résume le nombre d'arrêts et le temps de recharge", () => {
    expect(chargingSummaryText(2, base)).toContain("2 arrêts");
    expect(chargingSummaryText(2, base)).toContain("1 h 0 min");
  });

  it("le dit quand aucun arrêt n'est nécessaire", () => {
    expect(chargingSummaryText(0, { ...base, chargingDurationS: 0 })).toMatch(/Aucun arrêt/);
  });

  it("signale une recharge sans borne trouvée", () => {
    expect(chargingSummaryText(1, { ...base, unplaced: 2 })).toMatch(/2 recharges sans borne/);
  });

  it("annonce la panne de data.gouv plutôt que l'absence d'arrêt", () => {
    expect(chargingSummaryText(0, { ...base, unavailable: true })).toMatch(/IRVE/);
  });

  it("signale un tronçon nettement plus long que l'intervalle demandé", () => {
    // Chaque détour par une borne rallonge le trajet : taire l'écart
    // laisserait croire que l'intervalle est tenu au mètre près.
    expect(chargingSummaryText(3, { ...base, maxGapM: 26000 })).toMatch(/26\.0 km/);
    expect(chargingSummaryText(3, { ...base, maxGapM: 20400 })).not.toMatch(/tronçon/);
  });
});

describe("chargingStopLines", () => {
  const stop = {
    name: "Borne test",
    address: "1 rue du Test",
    power_kw: 50,
    point_count: 4,
    two_wheeler: true,
    route_distance_m: 20500,
    detour_m: 640,
  };

  it("décrit la borne, sa position et son écart au tracé", () => {
    expect(chargingStopLines(stop)).toEqual([
      "1 rue du Test",
      "50 kW · 4 points de charge · deux-roues",
      "À 20.5 km du départ",
      "640 m d'écart au tracé direct",
    ]);
  });

  it("omet ce que la source ne renseigne pas", () => {
    const lines = chargingStopLines({ ...stop, address: null, power_kw: null, point_count: 1, two_wheeler: false });
    expect(lines).toEqual(["À 20.5 km du départ", "640 m d'écart au tracé direct"]);
  });

  it("tait un écart négligeable au tracé", () => {
    expect(chargingStopLines({ ...stop, detour_m: 30 })).not.toContain("30 m d'écart au tracé direct");
  });
});

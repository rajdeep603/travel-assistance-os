// ---------------------------------------------------------------------------
// Medical transport (repatriation) planning, as a pure function: from what
// the treating doctor says about fitness to fly, mobility, oxygen and
// monitoring, the least intensive transport that is medically safe, with an
// indicative cost for every option. The most expensive mistake in
// assistance is an air ambulance where a stretcher or an escorted seat on a
// scheduled flight would do; the doctor still decides, the rules show the
// options. Prices are a fictional demo table, not quotes.
// ---------------------------------------------------------------------------

export type Mobility = "SEATED" | "WHEELCHAIR" | "STRETCHER";
export type Monitoring = "NONE" | "BASIC" | "CONTINUOUS";
export type Escort = "NONE" | "NURSE" | "DOCTOR";
export type TransportModeCode = "COMMERCIAL" | "COMMERCIAL_ESCORTED" | "COMMERCIAL_STRETCHER" | "AIR_AMBULANCE" | "NOT_FIT_TO_FLY";
export type Distance = "SHORT_HAUL" | "LONG_HAUL";

export interface TransportAssessment {
  diagnosis: string;
  /** Fit to fly now, or from the day in fitFrom; false when the doctor can't say yet. */
  fitToFly: boolean;
  /** The day the doctor expects the patient to be fit to fly (YYYY-MM-DD or words). */
  fitFrom?: string | null;
  mobility: Mobility;
  /** Supplemental oxygen in litres per minute; 0 for none. */
  oxygenLpm: number;
  monitoring: Monitoring;
  intensiveCare: boolean;
  /** The escort the doctor recommends. */
  escort: Escort;
  /** Where the patient goes: city or hospital at home. */
  destination?: string | null;
  destinationCountry?: string | null;
  notes?: string | null;
}

export interface TransportOption {
  mode: Exclude<TransportModeCode, "NOT_FIT_TO_FLY">;
  label: string;
  low: number;
  high: number;
  suitable: boolean;
}

export interface TransportRecommendation {
  mode: TransportModeCode;
  label: string;
  reasons: string[];
  distance: Distance;
  currency: "EUR";
  options: TransportOption[];
  /** Indicative cost range of the recommended mode (0 when not fit to fly). */
  low: number;
  high: number;
  /** Midpoint saving against an air ambulance, when one isn't needed. */
  avoidedVsAirAmbulance: number;
}

export const TRANSPORT_TARIFF_VERSION = "demo-transport-tariff-2026.1";

const MODES: Exclude<TransportModeCode, "NOT_FIT_TO_FLY">[] = ["COMMERCIAL", "COMMERCIAL_ESCORTED", "COMMERCIAL_STRETCHER", "AIR_AMBULANCE"];

export const MODE_LABELS: Record<TransportModeCode, string> = {
  COMMERCIAL: "Scheduled flight, seated",
  COMMERCIAL_ESCORTED: "Scheduled flight with a medical escort",
  COMMERCIAL_STRETCHER: "Stretcher on a scheduled flight",
  AIR_AMBULANCE: "Air ambulance",
  NOT_FIT_TO_FLY: "Not fit to fly yet",
};

/** Indicative one-way cost, bed to bed, from Istanbul (EUR). */
const PRICES: Record<Distance, Record<(typeof MODES)[number], [number, number]>> = {
  SHORT_HAUL: {
    COMMERCIAL: [350, 900],
    COMMERCIAL_ESCORTED: [3000, 5500],
    COMMERCIAL_STRETCHER: [9000, 15000],
    AIR_AMBULANCE: [25000, 45000],
  },
  LONG_HAUL: {
    COMMERCIAL: [900, 2500],
    COMMERCIAL_ESCORTED: [6500, 11000],
    COMMERCIAL_STRETCHER: [22000, 38000],
    AIR_AMBULANCE: [75000, 140000],
  },
};

/** Europe, the Middle East and North Africa are short haul from Istanbul. */
const LONG_HAUL = /\b(usa|united states|america|canada|mexico|brazil|argentina|chile|colombia|peru|australia|new zealand|japan|china|korea|india|thailand|singapore|indonesia|philippines|malaysia|vietnam|south africa|kenya|nigeria)\b/i;

export function distanceFor(country: string | null | undefined): Distance {
  return country && LONG_HAUL.test(country) ? "LONG_HAUL" : "SHORT_HAUL";
}

const rank = (m: (typeof MODES)[number]) => MODES.indexOf(m);

export function recommendTransport(a: TransportAssessment): TransportRecommendation {
  const distance = distanceFor(a.destinationCountry ?? a.destination);
  const reasons: string[] = [];
  let mode: (typeof MODES)[number];

  if (a.intensiveCare) {
    mode = "AIR_AMBULANCE";
    reasons.push("Intensive care during transport needs an air ambulance.");
  } else if (a.mobility === "STRETCHER" && (a.oxygenLpm > 4 || a.monitoring === "CONTINUOUS")) {
    mode = "AIR_AMBULANCE";
    reasons.push(
      a.oxygenLpm > 4
        ? `Stretcher with ${a.oxygenLpm} L/min oxygen is above what airlines carry on scheduled flights.`
        : "Stretcher with continuous monitoring needs an air ambulance."
    );
  } else if (a.mobility === "STRETCHER") {
    mode = "COMMERCIAL_STRETCHER";
    reasons.push("Lying flat, stable: a stretcher on a scheduled flight with a medical escort.");
  } else if (a.escort !== "NONE" || a.oxygenLpm > 0 || a.monitoring !== "NONE") {
    mode = "COMMERCIAL_ESCORTED";
    reasons.push(
      [
        a.escort !== "NONE" ? `the doctor recommends a ${a.escort === "DOCTOR" ? "doctor" : "nurse"} escort` : null,
        a.oxygenLpm > 0 ? `${a.oxygenLpm} L/min oxygen in flight` : null,
        a.monitoring !== "NONE" ? `${a.monitoring === "CONTINUOUS" ? "continuous" : "basic"} monitoring` : null,
      ]
        .filter(Boolean)
        .join(", ")
        .replace(/^./, (c) => c.toUpperCase()) + ": seated on a scheduled flight with a medical escort."
    );
  } else {
    mode = "COMMERCIAL";
    reasons.push(a.mobility === "WHEELCHAIR" ? "Can fly seated with wheelchair assistance at both airports." : "Can fly seated without an escort.");
  }
  if (a.fitToFly && a.fitFrom) reasons.push(`Fit to fly from ${a.fitFrom}: plan the journey for then.`);

  if (mode !== "AIR_AMBULANCE" && (a.oxygenLpm > 0 || a.escort !== "NONE" || a.mobility !== "SEATED")) {
    reasons.push("The airline's medical clearance form (MEDIF) is needed before booking.");
  }

  const options: TransportOption[] = MODES.map((m) => ({
    mode: m,
    label: MODE_LABELS[m],
    low: PRICES[distance][m][0],
    high: PRICES[distance][m][1],
    suitable: rank(m) >= rank(mode),
  }));
  const mid = (m: (typeof MODES)[number]) => (PRICES[distance][m][0] + PRICES[distance][m][1]) / 2;

  if (!a.fitToFly) {
    return {
      mode: "NOT_FIT_TO_FLY",
      label: MODE_LABELS.NOT_FIT_TO_FLY,
      reasons: [`Not fit to fly yet${a.fitFrom ? `; the doctor expects ${a.fitFrom}` : ""}. Reassess then; when fit: ${MODE_LABELS[mode].toLowerCase()}.`, ...reasons.slice(1).filter((r) => !r.startsWith("Fit to fly from"))],
      distance,
      currency: "EUR",
      options,
      low: 0,
      high: 0,
      avoidedVsAirAmbulance: 0,
    };
  }
  const [low, high] = PRICES[distance][mode];
  return {
    mode,
    label: MODE_LABELS[mode],
    reasons,
    distance,
    currency: "EUR",
    options,
    low,
    high,
    avoidedVsAirAmbulance: mode === "AIR_AMBULANCE" ? 0 : mid("AIR_AMBULANCE") - mid(mode),
  };
}

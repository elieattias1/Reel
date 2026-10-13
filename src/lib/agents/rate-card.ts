/**
 * Manually seeded reference tables. There's no historical production data
 * yet, so these ground the breakdown and budgeting agents: typical crew
 * sizes by production scale, and a fallback day-rate/flat-rate card the
 * budgeting agent cross-checks live web search against (and falls back to,
 * marked `low_confidence`, when search can't find a confident number).
 *
 * These are intentionally rough industry-typical U.S. indie-film figures
 * for an MVP — replace with real comps before trusting a financing
 * conversation on the rate-card numbers alone.
 */

export type ProductionScale = "micro" | "low" | "mid";

/** Typical speaking-role and crew headcounts by apparent production scale. */
export const CREW_REFERENCE: Record<
  ProductionScale,
  { description: string; crew: { role_type: string; headcount: number }[] }
> = {
  micro: {
    description: "Micro-budget (<$500K), small cast, few locations, minimal stunts/VFX",
    crew: [
      { role_type: "Director", headcount: 1 },
      { role_type: "1st AD", headcount: 1 },
      { role_type: "Producer", headcount: 1 },
      { role_type: "Director of Photography", headcount: 1 },
      { role_type: "Camera Operator / Assistant", headcount: 1 },
      { role_type: "Gaffer", headcount: 1 },
      { role_type: "Key Grip", headcount: 1 },
      { role_type: "Sound Mixer", headcount: 1 },
      { role_type: "Production Designer", headcount: 1 },
      { role_type: "Wardrobe/Makeup", headcount: 1 },
      { role_type: "Production Assistant", headcount: 2 },
    ],
  },
  low: {
    description: "Low-budget ($500K–$3M), moderate cast/crew, several locations",
    crew: [
      { role_type: "Director", headcount: 1 },
      { role_type: "1st AD", headcount: 1 },
      { role_type: "2nd AD", headcount: 1 },
      { role_type: "Producer", headcount: 2 },
      { role_type: "Director of Photography", headcount: 1 },
      { role_type: "Camera Operator", headcount: 2 },
      { role_type: "Gaffer", headcount: 1 },
      { role_type: "Electrician", headcount: 2 },
      { role_type: "Key Grip", headcount: 1 },
      { role_type: "Grip", headcount: 2 },
      { role_type: "Sound Mixer", headcount: 1 },
      { role_type: "Boom Operator", headcount: 1 },
      { role_type: "Production Designer", headcount: 1 },
      { role_type: "Art Director", headcount: 1 },
      { role_type: "Wardrobe", headcount: 2 },
      { role_type: "Hair & Makeup", headcount: 2 },
      { role_type: "Script Supervisor", headcount: 1 },
      { role_type: "Production Assistant", headcount: 4 },
    ],
  },
  mid: {
    description: "Mid-budget ($3M+), large cast/crew, many locations, stunts/VFX present",
    crew: [
      { role_type: "Director", headcount: 1 },
      { role_type: "1st AD", headcount: 1 },
      { role_type: "2nd AD", headcount: 2 },
      { role_type: "Producer", headcount: 3 },
      { role_type: "Director of Photography", headcount: 1 },
      { role_type: "Camera Operator", headcount: 3 },
      { role_type: "Gaffer", headcount: 1 },
      { role_type: "Electrician", headcount: 4 },
      { role_type: "Key Grip", headcount: 1 },
      { role_type: "Grip", headcount: 4 },
      { role_type: "Sound Mixer", headcount: 1 },
      { role_type: "Boom Operator", headcount: 1 },
      { role_type: "Production Designer", headcount: 1 },
      { role_type: "Art Director", headcount: 2 },
      { role_type: "Set Decorator", headcount: 1 },
      { role_type: "Wardrobe", headcount: 3 },
      { role_type: "Hair & Makeup", headcount: 3 },
      { role_type: "Stunt Coordinator", headcount: 1 },
      { role_type: "VFX Supervisor", headcount: 1 },
      { role_type: "Script Supervisor", headcount: 1 },
      { role_type: "Production Assistant", headcount: 6 },
    ],
  },
};

/** Flat daily/weekly rate-card fallback, used when web search can't confirm a price. */
export const RATE_CARD: Record<string, { amount: number; unit: string }> = {
  "Director day rate": { amount: 1200, unit: "day" },
  "1st AD day rate": { amount: 650, unit: "day" },
  "Director of Photography day rate": { amount: 900, unit: "day" },
  "Camera Operator day rate": { amount: 500, unit: "day" },
  "Gaffer day rate": { amount: 500, unit: "day" },
  "Key Grip day rate": { amount: 450, unit: "day" },
  "Sound Mixer day rate": { amount: 550, unit: "day" },
  "Production Designer day rate": { amount: 600, unit: "day" },
  "Production Assistant day rate": { amount: 200, unit: "day" },
  "Camera package rental": { amount: 1500, unit: "week" },
  "Lighting package rental": { amount: 1200, unit: "week" },
  "Grip package rental": { amount: 800, unit: "week" },
  "Generic interior location rental": { amount: 1500, unit: "day" },
  "Generic exterior location permit": { amount: 500, unit: "day" },
  "Catering": { amount: 22, unit: "person/day" },
  "Production insurance": { amount: 2500, unit: "flat" },
};

/** Pick a production scale from breakdown signals: cast size, location count, complexity flags. */
export function estimateProductionScale(signal: {
  speakingRoles: number;
  locationCount: number;
  complexityFlagCount: number;
}): ProductionScale {
  const { speakingRoles, locationCount, complexityFlagCount } = signal;
  if (speakingRoles > 15 || locationCount > 12 || complexityFlagCount > 5) return "mid";
  if (speakingRoles > 6 || locationCount > 5 || complexityFlagCount > 1) return "low";
  return "micro";
}

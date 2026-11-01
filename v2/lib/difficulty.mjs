/*
 * difficulty.mjs - difficulty 1..10 of a side (and of a pass = its hardest side).
 * Rick, 01/11/2026: the old score weighted the average gradient too much and the climb too little:
 * 1,365 climbs were 10/10, a 3.4 km +321 m wall (Musberg) as much as the Stelvio. Now it starts from
 * the FIETS index (gain^2 / (length*10) + (top-1000)/1000, the Dutch cycling magazine's classic),
 * mapped on a gentle curve so that 10 is kept for the giants: Stelvio, Mortirolo, Zoncolan, Grappa 10,
 * Manghen 9, Gavia and Giau 8, Pordoi 6, Musberg 4. About 76 climbs are 10/10, 176 are 9/10.
 * Same function as scripts/lib/difficulty.mjs (test/difficulty.test.mjs keeps them equal): the
 * curated passes get their difficulty here, from their sides, so the whole map uses one scale.
 */
export function fiets(km, gain, top) {
  if (!(km > 0) || !(gain > 0)) return 0;
  return gain * gain / (km * 1000 * 10) + Math.max(0, ((top || 0) - 1000) / 1000);
}
export function difficultyOf(km, gain, top) {
  const f = fiets(km, gain, top);
  return Math.max(1, Math.min(10, Math.round(1 + 9 * Math.pow(Math.min(1, f / 14), 0.7))));
}
export function passDifficulty(versanti) {
  const vs = (versanti || []).filter((v) => v && v.distance_km > 0 && v.endElevation != null && v.startElevation != null);
  return vs.length ? Math.max(...vs.map((v) => difficultyOf(v.distance_km, v.endElevation - v.startElevation, v.endElevation))) : null;
}

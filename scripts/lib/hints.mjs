/*
 * hints.mjs - which base_hints.json entry applies to a pass (used by build_osm_passes.mjs).
 * The key must be CONTAINED in the pass name (never the reverse), after dropping "passo", "del"...
 * When several keys match, the FIRST one in the file wins: keep a specific key ("San Pellegrino in
 * Alpe") above a shorter one it contains ("Passo San Pellegrino"). test/hints.test.mjs guards this.
 */
export const normH = (n) => (n || "").toLowerCase().replace(/passo |del |dell'|della |di |monte |dello |colle |col /g, "").trim();
export function hintKeyFor(name, hints) {
  const nn = normH(name);
  for (const key in hints) { const nk = normH(key); if (nk && nn.indexOf(nk) >= 0) return key; }
  return null;
}

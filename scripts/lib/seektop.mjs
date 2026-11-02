/* Find the top of a short climb from a rough point (OSM gives a street's midpoint, not its top).
   reachable(): every road vertex within maxKm along the graph from the start vertex
   (Dijkstra on real km, bounded by maxNodes). pickTop(): the highest of them, the nearest one
   on ties (DEM noise of a metre must not drag the top along a flat ridge road). Pure: the graph
   is passed in as a neighbors(key) callback -> [{key, seg}], keys are "lat,lon". */
export function reachable(startKey, neighbors, maxKm, maxNodes = 800) {
  const dist = new Map([[startKey, 0]]), done = new Set(), out = [];
  const queue = [[0, startKey]];
  while (queue.length && out.length < maxNodes) {
    let bi = 0; for (let i = 1; i < queue.length; i++) if (queue[i][0] < queue[bi][0]) bi = i;
    const [d, k] = queue.splice(bi, 1)[0];
    if (done.has(k)) continue;
    done.add(k);
    const [lat, lon] = k.split(",").map(Number);
    out.push({ key: k, lat, lon, d });
    for (const nb of neighbors(k)) {
      const nd = d + nb.seg;
      if (nd > maxKm || done.has(nb.key)) continue;
      if (!dist.has(nb.key) || nd < dist.get(nb.key)) { dist.set(nb.key, nd); queue.push([nd, nb.key]); }
    }
  }
  return out;
}

export function pickTop(nodes, elev, tolM = 2) {
  let max = -Infinity;
  for (let i = 0; i < nodes.length; i++) if (Number.isFinite(elev[i]) && elev[i] > max) max = elev[i];
  if (max === -Infinity) return null;
  let best = -1; // within tolM of the highest point, take the one nearest the start
  for (let i = 0; i < nodes.length; i++) if (Number.isFinite(elev[i]) && elev[i] >= max - tolM && (best < 0 || nodes[i].d < nodes[best].d)) best = i;
  return { ...nodes[best], ele: elev[best] };
}

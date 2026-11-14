/*
 * maps.mjs - the basemaps v2 offers (Rick, 31/10/2026: "Notte+" by default, a "Mappe" picker, the Giro
 * switches to "Ciclabile" by itself). All free and keyless; the raster ones are fair-use services
 * (attribution always shown; heavy traffic would need a paid or self-hosted source).
 * Drafts with real tiles: the "Mappe di LocaRide" artifact.
 */
export const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const OSM = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const raster = (tiles, attribution, maxzoom) => ({
  version: 8, glyphs: GLYPHS,
  sources: { base: { type: "raster", tiles, tileSize: 256, maxzoom, attribution } },
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#0B0F14" } }, { id: "base", type: "raster", source: "base" }]
});
const abc = (u) => ["a", "b", "c"].map((s) => u.replace("{s}", s));
export const BASEMAPS = [
  { id: "notte", label: "Notte+", sub: "di partenza", hillshade: true, swatch: "linear-gradient(135deg,#0E141B 40%,#8A9AAD 41%,#8A9AAD 46%,#1A2531 47%)",
    style: "https://tiles.openfreemap.org/styles/dark" },
  { id: "chiara", label: "Chiara", sub: "di giorno", hillshade: true, swatch: "linear-gradient(135deg,#F2EFE6 40%,#F6C445 41%,#F6C445 47%,#DDE8CF 48%)",
    style: "https://tiles.openfreemap.org/styles/liberty" },
  { id: "ciclabile", label: "Ciclabile", sub: "per il Giro", hillshade: true, cycle: true, swatch: "linear-gradient(135deg,#F2EFE6 40%,#2F54EB 41%,#2F54EB 45%,#DDE8CF 46%)",
    style: "https://tiles.openfreemap.org/styles/liberty" },
  { id: "topo", label: "Topografica", sub: "terreno", hillshade: false, swatch: "repeating-radial-gradient(circle at 70% 30%,#E8E4C9 0 6px,#C9B98A 7px 8px)",
    style: raster(abc("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"), 'Stile © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA) · ' + OSM, 17) },
  /* Rick 14/11/2026: the orthophoto was blurry when zooming in - it was Sentinel-2 (10 m pixels, z15 at most).
     Esri World Imagery has aerial photos down to z19 (~0.3-0.5 m in Italy): enough to see whether a road is
     tarmac before riding it. Attribution as Esri asks. */
  { id: "satellite", label: "Satellite", sub: "ortofoto", hillshade: false, swatch: "radial-gradient(circle at 30% 30%,#4F6B3A,#1E2C17 70%)",
    style: raster(["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], 'Immagini © <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics e la comunità GIS', 19) }
];
export const DEFAULT_MAP = "notte", GIRO_MAP = "ciclabile";
export function basemap(id) { return BASEMAPS.find((b) => b.id === id) || BASEMAPS[0]; }

/* The background of the shared ride image ("Condividi" in the Giro): always the dark map with the relief
   and only city/town names, whatever map the user is looking at. Ciclabile/CyclOSM or Topografica behind the
   ride did not read (07/11, Rick): labels, icons and coloured roads fought with the route and the header.
   The dark relief also matches the card (#0B0F14) and lets the route colours stand out. */
export const EXPORT_MAP = {
  id: "export", style: "https://tiles.openfreemap.org/styles/dark",
  hillshade: { "hillshade-shadow-color": "#000000", "hillshade-highlight-color": "#4A5A6C", "hillshade-exaggeration": 0.7 },
  credit: "© OpenFreeMap · OpenMapTiles · OpenStreetMap · rilievo: AWS Terrain Tiles"
};
/* layers kept on the export map: everything but text and icons, except the names of cities and towns */
export function exportLayer(layer) { return !!layer && (layer.type !== "symbol" || /(^|_)(city|town)($|_)/.test(layer.id)); }

/* "Ciclabile" (Rick 14/11/2026: the CyclOSM raster loaded slowly from a volunteer server and drew badly over
   3D terrain): OpenFreeMap's light vector map with the bike network drawn on top from the SAME vector tiles
   (OpenMapTiles "transportation": subclass, bicycle, surface) - same fast CDN as the other maps, sharp at any
   zoom. Blue with a white edge = cycleways and roads signed for bikes; brown dashes = unpaved roads and tracks
   (hiking paths left out: too many in the mountains). */
export const CYCLE_SOURCE = "openmaptiles";
const BIKE = ["any", ["==", ["get", "subclass"], "cycleway"], ["==", ["get", "class"], "cycleway"], ["==", ["get", "bicycle"], "designated"]];
export function cycleLayers(src = CYCLE_SOURCE) {
  const tl = { source: src, "source-layer": "transportation" }, w = (a, b) => ["interpolate", ["linear"], ["zoom"], 11, a, 16, b];
  return [
    { id: "cyc-unpaved", type: "line", ...tl, minzoom: 11, layout: { "line-cap": "butt" },
      filter: ["all", ["==", ["get", "surface"], "unpaved"], ["in", ["get", "class"], ["literal", ["track", "minor", "service", "tertiary", "secondary"]]], ["!", BIKE]],
      paint: { "line-color": "#8A5A2B", "line-width": w(1, 3), "line-dasharray": [2, 1.5] } },
    { id: "cyc-case", type: "line", ...tl, minzoom: 9, filter: BIKE, layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#FFFFFF", "line-width": w(2.5, 7) } },
    { id: "cyc-line", type: "line", ...tl, minzoom: 9, filter: BIKE, layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#2F54EB", "line-width": w(1.2, 4) } }
  ];
}

/* "Notte+": the dark style with readable roads and labels (the plain dark one was black on black) */
export function notteRoads(layer) {
  if (layer.type === "background") return { "background-color": "#0E141B" };
  if (layer.type === "line" && /road|highway|street|path|track|bridge|tunnel|transportation/.test(layer.id)) {
    const minor = /minor|service|path|track|street/.test(layer.id);
    return { "line-color": minor ? "#5C6B7D" : "#8A9AAD", "line-opacity": minor ? 0.8 : 0.95 };
  }
  if (layer.type === "symbol" && /road|transportation/.test(layer.id)) return { "text-color": "#C9D3DE" };
  if (layer.type === "fill" && /water/.test(layer.id)) return { "fill-color": "#0A1724" };
  if (layer.type === "fill" && /landcover|landuse|park|wood/.test(layer.id)) return { "fill-opacity": 0.35 };
  return null;
}

/* "Strade trafficate": the main roads (motorway, trunk = superstrade, primary = statali, secondary =
   provinciali principali) highlighted over any basemap, from OpenFreeMap's vector tiles. It is the road
   class, not a traffic count - said so in the picker - but it is real data for every road, and the
   class is what decides cars and trucks on a climb (the same rule as the "trucks" field). */
/* turquoise, a hue the climbs never use: red/orange/yellow roads read as climb gradients (Rick, 01/11) */
export const TRAFFIC_CLASSES = [
  { k: "motorway", c: "#2DD4BF", label: "autostrade" }, { k: "trunk", c: "#2DD4BF", label: "superstrade" },
  { k: "primary", c: "#5EEAD4", label: "statali" }, { k: "secondary", c: "#99F6E4", label: "provinciali" }
];
export const TRAFFIC_SOURCE = { type: "vector", url: "https://tiles.openfreemap.org/planet" };
export function trafficLayer() {
  return {
    id: "traffic", type: "line", source: "traffic", "source-layer": "transportation", minzoom: 6,
    filter: ["all", ["in", ["get", "class"], ["literal", TRAFFIC_CLASSES.map((x) => x.k)]], ["!=", ["get", "brunnel"], "tunnel"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["match", ["get", "class"], ...TRAFFIC_CLASSES.flatMap((x) => [x.k, x.c]), "#99F6E4"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 10, 2.2, 14, 5],
      "line-opacity": 0.85
    }
  };
}


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
  { id: "ciclabile", label: "Ciclabile", sub: "per il Giro", hillshade: false, swatch: "linear-gradient(135deg,#D9E4C4 40%,#3B5BDB 41%,#3B5BDB 45%,#B7C99A 46%)",
    style: raster(abc("https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png"), '<a href="https://www.cyclosm.org">CyclOSM</a> · ' + OSM, 18) },
  { id: "topo", label: "Topografica", sub: "terreno", hillshade: false, swatch: "repeating-radial-gradient(circle at 70% 30%,#E8E4C9 0 6px,#C9B98A 7px 8px)",
    style: raster(abc("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"), 'Stile © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA) · ' + OSM, 17) },
  { id: "satellite", label: "Satellite", sub: "dall'alto", hillshade: false, swatch: "radial-gradient(circle at 30% 30%,#4F6B3A,#1E2C17 70%)",
    style: raster(["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg"], '<a href="https://s2maps.eu">Sentinel-2 cloudless 2016</a> by EOX IT Services GmbH (dati Copernicus Sentinel, CC BY 4.0)', 15) }
];
export const DEFAULT_MAP = "notte", GIRO_MAP = "ciclabile";
export function basemap(id) { return BASEMAPS.find((b) => b.id === id) || BASEMAPS[0]; }

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
export const TRAFFIC_CLASSES = [
  { k: "motorway", c: "#E5484D", label: "autostrade" }, { k: "trunk", c: "#E5484D", label: "superstrade" },
  { k: "primary", c: "#F28C38", label: "statali" }, { k: "secondary", c: "#F2C14E", label: "provinciali" }
];
export const TRAFFIC_SOURCE = { type: "vector", url: "https://tiles.openfreemap.org/planet" };
export function trafficLayer() {
  return {
    id: "traffic", type: "line", source: "traffic", "source-layer": "transportation", minzoom: 6,
    filter: ["all", ["in", ["get", "class"], ["literal", TRAFFIC_CLASSES.map((x) => x.k)]], ["!=", ["get", "brunnel"], "tunnel"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["match", ["get", "class"], ...TRAFFIC_CLASSES.flatMap((x) => [x.k, x.c]), "#F2C14E"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 10, 2.2, 14, 5],
      "line-opacity": 0.8
    }
  };
}


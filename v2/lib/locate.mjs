/*
 * locate.mjs - "my position" as a blue dot, live (Rick, 11/11/2026: "like Google Maps, but lighter").
 * Pure helpers for app.mjs: halo size from the GPS accuracy, heading from the GPS or the compass,
 * and the button's states. app.mjs draws ONE MapLibre Marker (a DOM element, no style layers:
 * it survives basemap switches) and moves it on every fix; nothing is redrawn on the map itself.
 */
const EARTH = 40075016.686;   // m, equator; MapLibre tiles are 512 px

/* metres per CSS pixel at this latitude and zoom */
export function mPerPx(lat, zoom) { return EARTH * Math.cos(lat * Math.PI / 180) / (512 * 2 ** zoom); }

/* diameter (px) of the accuracy halo: 2 x accuracy, capped so a 5-km network fix does not cover the screen */
export function haloPx(acc, lat, zoom, max = 700) {
  if (!(acc > 0) || lat == null) return 0;
  return Math.round(Math.min(max, 2 * acc / mPerPx(lat, zoom)));
}

/* compass heading (deg from north) from a deviceorientation event, or null:
   iOS gives webkitCompassHeading; Android's "deviceorientationabsolute" gives alpha counter-clockwise */
export function compassOf(e, screenAngle = 0) {
  if (!e) return null;
  if (e.webkitCompassHeading != null && isFinite(e.webkitCompassHeading)) return (e.webkitCompassHeading + screenAngle + 360) % 360;
  if (e.absolute && e.alpha != null && isFinite(e.alpha)) return (360 - e.alpha + screenAngle + 360) % 360;
  return null;
}

/* the way you are going: the GPS course while moving (> 1.5 m/s, ~5 km/h), else the compass, else none */
export function headingOf(pos, compass) {
  if (pos && pos.heading != null && isFinite(pos.heading) && (pos.speed || 0) > 1.5) return pos.heading;
  return compass == null ? null : compass;
}

/* the locate button: off -> follow (dot + map follows you) -> off; after you move the map yourself the
   dot stays and the mode is "free": the next tap brings the map back on you */
export function nextMode(mode) { return mode === "follow" ? "off" : "follow"; }

/* a fix older than this is drawn grey (no signal, in a tunnel...) */
export const STALE_MS = 30000;

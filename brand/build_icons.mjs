// builds the final LocaRide icon set from the approved drafts (tornante + hidden LR, round 3)
import opentype from "opentype.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const font = opentype.parse(readFileSync(process.argv[2] || "node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-italic.woff").buffer);
const LIME = "#C8F560", INK = "#0B0F14", HL = "#FFD23F";
const ROAD = "M104 424 L366 388 A33 33 0 0 0 362 322 L156 296 A29 29 0 0 1 160 238 L334 214 A26 26 0 0 0 330 162 L238 150";
// "LR" as outlines, centred on x like text-anchor="middle", tracking -10 (as the drafts)
function lrPath(cx, base, size, track = -10) {
  const g = font.stringToGlyphs("LR"), sc = size / font.unitsPerEm;
  let w = 0; g.forEach((gl, i) => { w += gl.advanceWidth * sc + (i < g.length - 1 ? track : 0); });
  let x = cx - w / 2, d = "";
  g.forEach((gl) => { d += gl.getPath(x, base, size).toPathData(1); x += gl.advanceWidth * sc + track; });
  return d;
}
const L2 = lrPath(250, 372, 330), L3 = lrPath(250, 470, 560);
const road = (fg, dot, k = 1) => `<g transform="translate(256 256) scale(${k}) translate(-256 -256) translate(20 -30)"><path class="road" d="${ROAD}" fill="none" stroke="${fg}" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/><circle class="dot" cx="226" cy="148" r="30" fill="${dot}"/></g>`;
const svg = (body, { bg, rx = 0, clip = false } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${clip ? `<defs><clipPath id="c"><rect width="512" height="512" rx="${rx}"/></clipPath></defs><g clip-path="url(#c)">` : ""}<rect class="bg" width="512" height="512" rx="${rx}" fill="${bg}"/>${body}${clip ? "</g>" : ""}</svg>\n`;
mkdirSync("brand", { recursive: true });
const files = {
  "brand/icon-L2-lime.svg": svg(`<path class="lr" d="${L2}" fill="#B4E04B"/>` + road(INK, INK), { bg: LIME }),
  "brand/icon-L3-lime.svg": svg(`<path class="lr" d="${L3}" fill="#B4E04B"/>` + road(INK, INK), { bg: LIME }),
  "brand/icon-L2-notte.svg": svg(`<path class="lr" d="${L2}" fill="#1C2733"/>` + road(LIME, HL), { bg: INK }),
  "brand/icon-L3-notte.svg": svg(`<path class="lr" d="${L3}" fill="#1C2733"/>` + road(LIME, HL), { bg: INK }),
  // phone: L2, content shrunk into the Android safe circle (80%)
  "brand/icon-L2-lime-maskable.svg": svg(`<g transform="translate(256 256) scale(.82) translate(-256 -256)"><path d="${L2}" fill="#B4E04B"/></g>` + road(INK, INK, 0.82), { bg: LIME }),
  // desktop: L3 with the rounded corners drawn in (Windows and Linux show the file as it is)
  "brand/icon-L3-lime-rounded.svg": svg(`<path d="${L3}" fill="#B4E04B"/>` + road(INK, INK), { bg: LIME, rx: 115, clip: true }),
  // browser tab: L2, lime on a light browser, night on a dark one (the file switches by itself)
  "favicon.svg": svg(`<style>@media (prefers-color-scheme: dark){.bg{fill:${INK}}.lr{fill:#1C2733}.road{stroke:${LIME}}.dot{fill:${HL}}}</style><path class="lr" d="${L2}" fill="#B4E04B"/>` + road(INK, INK), { bg: LIME, rx: 100 })
};
for (const [f, s] of Object.entries(files)) writeFileSync(f, s);
console.log(Object.keys(files).join("\n"));

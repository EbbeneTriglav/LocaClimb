/*
 * seo.mjs - the static pages Google can index: one page per climb (/salite/<slug>/), an index of
 * all of them (/salite/ + one page per initial), sitemap.xml and robots.txt.
 * Why: the app lives at locaride.app/#/s/<id> and Google does not index what comes after the "#"
 * ("Don't use fragments to change the content of a page", Google URL structure guidelines).
 * Pure functions (tested in test/seo-pages.test.mjs); scripts/build_seo_pages.mjs reads the data and
 * writes the files. Pages are plain HTML + one shared stylesheet (/salite/salite.css), no script
 * (only the JSON-LD data block): the app is one tap away.
 */
import { implausible } from "../../v2/lib/climb.mjs";

export const SITE = "https://locaride.app";

/* "Passo dello Stelvio / Stilfser Joch" -> "passo-dello-stelvio-stilfser-joch" */
export function slugify(s) {
  const out = String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/ß/g, "ss").replace(/æ/g, "ae").replace(/ø/g, "o").replace(/œ/g, "oe").replace(/ł/g, "l").replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");
  return out || "salita";
}

/* one slug per climb, stable: the name; same name -> name + top height; still the same -> + id.
   Climbs are taken in a fixed order (curated first, then by id) so a new climb never steals a slug. */
export function assignSlugs(climbs) {
  const order = climbs.slice().sort((a, b) => (b.curated ? 1 : 0) - (a.curated ? 1 : 0) || String(a.id).localeCompare(String(b.id)));
  const used = new Set(), out = new Map();
  for (const c of order) {
    const base = slugify(c.name);
    let s = base;
    if (used.has(s) && c.elevation) s = `${base}-${Math.round(c.elevation)}`;
    if (used.has(s)) s = `${base}-${slugify(String(c.id))}`;
    used.add(s); out.set(c, s);
  }
  return out;
}

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const it1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace(".", ",").replace(/,0$/, "");
/* "Da Bormio" -> "da Bormio" inside a sentence; the place name keeps its capital */
const lowerDa = (s) => String(s).replace(/^(Da|Dal|Dalla|Dallo|Dai|Dagli|Dalle)\b/, (m) => m.toLowerCase());
const intIt = (x) => Math.round(x).toLocaleString("it-IT");

/* the side summaries a page shows: plausible numbers only (the sides the app marks "Dati da
   verificare" stay out), hardest (most gain) first */
export function sideRows(versanti) {
  const rows = [];
  for (const v of versanti || []) {
    const km = +v.distance_km, a = +v.startElevation, b = +v.endElevation;
    if (!(km > 0.3) || !(b > a) || implausible(v)) continue;
    const avg = +v.avgGradient > 0 ? +v.avgGradient : (b - a) / (km * 10);
    rows.push({ side: String(v.side || "").trim() || "Versante", km, gain: b - a, start: a, top: b, avg,
      max: +v.maxGradient > 0 ? +v.maxGradient : null, profile: Array.isArray(v.elevationProfile) ? v.elevationProfile.filter((x) => Number.isFinite(+x)).map(Number) : [] });
  }
  rows.sort((x, y) => y.gain - x.gain || y.km - x.km);
  const seen = new Set();   // two files can bring the same side twice under the same label
  return rows.filter((r) => { const k = r.side.toLowerCase() + "|" + Math.round(r.km); if (seen.has(k)) return false; seen.add(k); return true; });
}

/* the climb's profile, drawn: elevation over distance, no script */
export function profileSvg(r) {
  const p = r.profile.length >= 2 ? r.profile : [r.start, r.top];
  const W = 640, H = 160, lo = Math.min(...p), hi = Math.max(...p), span = Math.max(hi - lo, 50);
  const X = (i) => 40 + i / (p.length - 1) * (W - 56), Y = (e) => H - 24 - (e - lo) / span * (H - 48);
  const line = p.map((e, i) => `${X(i).toFixed(1)},${Y(e).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Profilo ${r.side}: da ${intIt(r.start)} a ${intIt(r.top)} m in ${it1(r.km)} km`)}">`
    + `<polygon points="40,${H - 24} ${line} ${W - 16},${H - 24}" fill="#c6f135" fill-opacity=".18"/>`
    + `<polyline points="${line}" fill="none" stroke="#c6f135" stroke-width="2.5" stroke-linejoin="round"/>`
    + `<text x="40" y="${H - 6}" class="t">0 km</text><text x="${W - 16}" y="${H - 6}" class="t" text-anchor="end">${esc(it1(r.km))} km</text>`
    + `<text x="34" y="${(Y(lo) + 4).toFixed(1)}" class="t" text-anchor="end">${intIt(lo)}</text><text x="34" y="${(Y(hi) + 4).toFixed(1)}" class="t" text-anchor="end">${intIt(hi)}</text></svg>`;
}

export const CSS = `@font-face{font-family:BC;src:url(/fonts/barlow/barlow-condensed-latin-800-italic.woff2) format("woff2");font-weight:800;font-style:italic;font-display:swap}
@font-face{font-family:BC;src:url(/fonts/barlow/barlow-condensed-latin-ext-800-italic.woff2) format("woff2");font-weight:800;font-style:italic;font-display:swap;unicode-range:U+0100-024F,U+1E00-1EFF}
*{box-sizing:border-box}body{margin:0;background:#0d1014;color:#e8edf2;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:#c6f135}header,main,footer{max-width:760px;margin:0 auto;padding:0 16px}
header{display:flex;justify-content:space-between;align-items:center;padding-top:16px;padding-bottom:8px}
.logo{font:800 italic 26px BC,sans-serif;color:#e8edf2;text-decoration:none}.logo:before{content:"";display:inline-block;width:14px;height:14px;background:#c6f135;margin-right:8px}
.crumbs{font-size:14px;color:#8a9aad}.kick{font-weight:600;font-size:14px;letter-spacing:.06em;text-transform:uppercase;color:#a9b4c0;margin:24px 0 0}
h1{font:800 italic 46px/1 BC,sans-serif;text-transform:uppercase;margin:8px 0 12px}h2{font:800 italic 28px BC,sans-serif;text-transform:uppercase;margin:32px 0 8px}
h3{margin:20px 0 4px;font-size:18px}.lead{font-size:18px;color:#c9d2dc}
.cta{display:block;text-align:center;background:#c6f135;color:#0d1014;font:800 italic 22px BC,sans-serif;text-transform:uppercase;text-decoration:none;padding:14px;border-radius:28px;margin:20px 0}
table{width:100%;border-collapse:collapse;font-size:15px}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #232a33}th{color:#8a9aad;font-weight:600}
td.n{text-align:right;white-space:nowrap}svg{width:100%;height:auto;display:block;background:#11161c;border-radius:12px}.t{fill:#8a9aad;font-size:12px}
ul.list{list-style:none;padding:0;columns:2;column-gap:24px}ul.list li{break-inside:avoid;padding:4px 0}small{color:#8a9aad}
footer{color:#8a9aad;font-size:13px;padding-top:24px;padding-bottom:40px}@media(max-width:520px){h1{font-size:36px}ul.list{columns:1}}`;

function shell({ title, description, canonical, body, jsonld }) {
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="LocaRide">
<meta property="og:locale" content="it_IT">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${SITE}/icon-512.png">
<meta name="theme-color" content="#0d1014">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>\n` : ""}<link rel="stylesheet" href="/salite/salite.css">
</head>
<body>
<header><a class="logo" href="/">LocaRide</a><a href="/salite/">Tutte le salite</a></header>
<main>
${body}
</main>
<footer>Dati delle strade © <a href="https://www.openstreetmap.org/copyright">contributori di OpenStreetMap</a> (ODbL). Quote da modelli del terreno, numeri calcolati da LocaRide: possono differire dai cartelli. <a href="/privacy">Privacy</a></footer>
</body>
</html>
`;
}

/* one climb's page. c: the climb (name, id, lat, lon, elevation, difficulty, cat, country);
   rows: sideRows(); near: [{name, slug, km}] other pages close by */
export function climbPage(c, slug, rows, near = []) {
  const url = `${SITE}/salite/${slug}/`, main = rows[0];
  const sidesTxt = rows.length === 1 ? "un versante" : `${rows.length} versanti`;
  const title = main ? `${c.name} in bici: ${lowerDa(main.side)} ${it1(main.km)} km al ${it1(main.avg)}% | LocaRide` : `${c.name} in bici | LocaRide`;
  const description = main
    ? `${c.name}${c.elevation ? ` (${intIt(c.elevation)} m)` : ""} in bici: ${sidesTxt}. ${main.side} ${it1(main.km)} km, +${intIt(main.gain)} m, ${it1(main.avg)}% di media. Profilo, meteo in cima e GPX su LocaRide.`
    : `${c.name} in bici: profilo, meteo in cima e GPX su LocaRide.`;
  const kick = [c.difficulty ? `Difficoltà ${c.difficulty}/10` : "", c.cat ? `cat. ${c.cat}` : "", c.country || "", c.elevation ? `${intIt(c.elevation)} m` : ""].filter(Boolean).join(" · ");
  const lead = main
    ? `${esc(c.name)} ha ${sidesTxt}. Il più impegnativo parte ${esc(lowerDa(main.side))}: ${esc(it1(main.km))} km con ${esc(intIt(main.gain))} m di dislivello, pendenza media del ${esc(it1(main.avg))}%${main.max ? ` e tratti fino al ${esc(it1(main.max))}%` : ""}.`
    : "";
  const table = rows.length ? `<h2>Versanti</h2>
<table><thead><tr><th>Versante</th><th>Km</th><th>Dislivello</th><th>Media</th><th>Max</th></tr></thead><tbody>
${rows.map((r) => `<tr><td>${esc(r.side)}<br><small>${esc(intIt(r.start))} → ${esc(intIt(r.top))} m</small></td><td class="n">${esc(it1(r.km))}</td><td class="n">+${esc(intIt(r.gain))} m</td><td class="n">${esc(it1(r.avg))}%</td><td class="n">${r.max ? esc(it1(r.max)) + "%" : "–"}</td></tr>`).join("\n")}
</tbody></table>
${rows.map((r) => `<h3>${esc(r.side)}</h3>\n${profileSvg(r)}`).join("\n")}` : "";
  const nearHtml = near.length ? `<h2>Salite vicine</h2>
<ul class="list">${near.map((n) => `<li><a href="/salite/${esc(n.slug)}/">${esc(n.name)}</a> <small>${esc(it1(n.km))} km</small></li>`).join("")}</ul>` : "";
  const body = `<nav class="crumbs"><a href="/">LocaRide</a> › <a href="/salite/">Salite</a> › ${esc(c.name)}</nav>
<p class="kick">${esc(kick)}</p>
<h1>${esc(c.name)}</h1>
${lead ? `<p class="lead">${lead}</p>` : ""}
<a class="cta" href="/#/s/${esc(encodeURIComponent(c.id))}">Apri in LocaRide: meteo in cima, mappa 3D, GPX e navigatore</a>
${table}
${nearHtml}`;
  const jsonld = {
    "@context": "https://schema.org", "@type": "TouristAttraction", name: c.name, description, url,
    geo: { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lon, ...(c.elevation ? { elevation: Math.round(c.elevation) } : {}) },
    touristType: "Ciclisti"
  };
  return shell({ title, description, canonical: url, body, jsonld });
}

/* first letter for the index pages: "Ötztaler" -> "o", "1000 Miglia" -> "0-9" */
export function initialOf(name) {
  const ch = slugify(name).charAt(0);
  return /[a-z]/.test(ch) ? ch : "0-9";
}

/* /salite/: the hardest, then the A-Z pages */
export function hubPage(entries, letters) {
  const top = entries.slice().sort((a, b) => (b.difficulty || 0) - (a.difficulty || 0) || (b.elevation || 0) - (a.elevation || 0)).slice(0, 60);
  const body = `<nav class="crumbs"><a href="/">LocaRide</a> › Salite</nav>
<h1>Salite e passi in bici</h1>
<p class="lead">${esc(intIt(entries.length))} salite su strada asfaltata, con i numeri di ogni versante: chilometri, dislivello, pendenza media e massima. Il meteo in cima, la mappa 3D, il GPX e il navigatore sono nell'app.</p>
<a class="cta" href="/">Apri la mappa delle salite</a>
<h2>Dalla A alla Z</h2>
<p>${letters.map((l) => `<a href="/salite/indice/${esc(l)}/">${esc(l.toUpperCase())}</a>`).join(" · ")}</p>
<h2>Le più dure</h2>
<ul class="list">${top.map((e) => `<li><a href="/salite/${esc(e.slug)}/">${esc(e.name)}</a> <small>${e.difficulty ? esc(e.difficulty) + "/10" : ""}${e.country ? " · " + esc(e.country) : ""}</small></li>`).join("")}</ul>`;
  return shell({ title: "Salite e passi in bici: elenco completo | LocaRide", description: `Elenco di ${intIt(entries.length)} salite e passi in bici con chilometri, dislivello e pendenza di ogni versante.`, canonical: `${SITE}/salite/`, body });
}

export function letterPage(letter, entries) {
  const L = letter.toUpperCase(), list = entries.slice().sort((a, b) => a.name.localeCompare(b.name, "it"));
  const body = `<nav class="crumbs"><a href="/">LocaRide</a> › <a href="/salite/">Salite</a> › ${esc(L)}</nav>
<h1>Salite con la ${esc(L)}</h1>
<ul class="list">${list.map((e) => `<li><a href="/salite/${esc(e.slug)}/">${esc(e.name)}</a> <small>${e.elevation ? esc(intIt(e.elevation)) + " m" : ""}${e.country ? " · " + esc(e.country) : ""}</small></li>`).join("")}</ul>`;
  return shell({ title: `Salite in bici con la ${L} | LocaRide`, description: `Salite e passi in bici che iniziano con la ${L}: numeri di ogni versante su LocaRide.`, canonical: `${SITE}/salite/indice/${letter}/`, body });
}

export function sitemapXml(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${esc(u.lastmod)}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
}

export function robotsTxt() {
  return `# locaride.app - generated by scripts/build_seo_pages.mjs
User-agent: *
Disallow: /__/
Disallow: /api/
Disallow: /classica/

Sitemap: ${SITE}/sitemap.xml
`;
}

/* the n closest entries to c (flat km), not c itself */
export function nearest(c, entries, n = 8, maxKm = 40) {
  const k = Math.cos(c.lat * Math.PI / 180) * 111.32;
  return entries.filter((e) => e !== c)
    .map((e) => ({ e, km: Math.hypot((e.lon - c.lon) * k, (e.lat - c.lat) * 110.57) }))
    .filter((x) => x.km <= maxKm).sort((a, b) => a.km - b.km).slice(0, n)
    .map((x) => ({ name: x.e.name, slug: x.e.slug, km: x.km }));
}

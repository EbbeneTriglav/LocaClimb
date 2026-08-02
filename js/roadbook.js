/* ===========================================================================
   LocaRide - Roadbook stampabile
   ---------------------------------------------------------------------------
   Produce un foglio da portarsi dietro (o da salvare in PDF) con: profilo
   altimetrico, tappe, fontanelle e ristori ordinati per chilometro, con l'ora
   di passaggio stimata e l'indicazione aperto/chiuso quando disponibile.

   PERCHE' NON UNA LIBRERIA PDF
   Il PDF viene generato dal browser stesso: apriamo una pagina impaginata per
   la stampa e usiamo "Stampa -> Salva come PDF". Zero librerie da caricare,
   funziona anche da telefono, e l'utente sceglie formato e margini. Aggiungere
   un generatore PDF significherebbe scaricare ~300 KB di libreria per fare
   peggio di quello che il browser fa gia' benissimo.

   ONESTA': non e' una navigazione svolta-per-svolta (per quella c'e' il GPX sul
   ciclocomputer). E' un piano di marcia: dove sali, dove bevi, dove mangi.
   =========================================================================== */

function rbkNum(v, d) { return (v == null || isNaN(v)) ? "-" : v.toFixed(d == null ? 1 : d); }
function rbkEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function rbkClock(ms) {
  if (!ms) return "";
  var d = new Date(ms);
  return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
}

/* Profilo altimetrico come SVG: si stampa nitido a qualsiasi risoluzione. */
function rbkProfileSvg(w, h) {
  var els = rbTrack.map(function (t) { return t[2]; }).filter(function (v) { return v != null; });
  if (els.length < 2) return "";
  var mn = Math.min.apply(null, els), mx = Math.max.apply(null, els), rng = Math.max(1, mx - mn);
  var n = 220, pts = [], cum = [0];
  for (var i = 1; i < rbTrack.length; i++) cum.push(cum[i - 1] + hav(rbTrack[i - 1][0], rbTrack[i - 1][1], rbTrack[i][0], rbTrack[i][1]));
  var tot = cum[cum.length - 1] || 1;
  for (var k = 0; k < n; k++) {
    var idx = Math.round(k * (rbTrack.length - 1) / (n - 1));
    var e = rbTrack[idx][2];
    if (e == null) e = pts.length ? pts[pts.length - 1][1] : mn;
    pts.push([(k / (n - 1)) * w, h - ((e - mn) / rng) * (h - 18) - 2]);
  }
  var d = "M0," + h + " ";
  pts.forEach(function (p) { d += "L" + p[0].toFixed(1) + "," + p[1].toFixed(1) + " "; });
  d += "L" + w + "," + h + " Z";
  var line = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ");
  var grid = "";
  for (var g = 1; g <= 3; g++) {
    var y = h - (h - 18) * g / 4 - 2, val = Math.round(mn + rng * g / 4);
    grid += '<line x1="0" y1="' + y.toFixed(1) + '" x2="' + w + '" y2="' + y.toFixed(1) + '" stroke="#e2e8f0" stroke-width="0.6"/>'
      + '<text x="2" y="' + (y - 2).toFixed(1) + '" font-size="8" fill="#94a3b8">' + val + ' m</text>';
  }
  return '<svg width="100%" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="display:block">'
    + grid
    + '<path d="' + d + '" fill="#dbeafe"/>'
    + '<path d="' + line + '" fill="none" stroke="#2563eb" stroke-width="1.4"/>'
    + '<text x="' + (w - 2) + '" y="' + (h - 3) + '" font-size="8" fill="#64748b" text-anchor="end">' + tot.toFixed(1) + ' km</text>'
    + '</svg>';
}

/* Km di ogni tappa, proiettandola sul tracciato. */
function rbkStopKm(s) {
  if (typeof distPtToTrack !== "function" || !rbTrack.length) return null;
  var r = distPtToTrack(s.lat, s.lon, rbTrack.map(function (c) { return [c[0], c[1]]; }));
  return r ? r.along : null;
}

/* Unisce tappe, acqua e ristori in un'unica sequenza ordinata per km. */
function rbkRows() {
  var rows = [];
  (rbStops || []).forEach(function (s, i) {
    rows.push({ km: rbkStopKm(s), kind: "tappa", label: s.name || ("Tappa " + (i + 1)), extra: (s.type === "point" ? "waypoint" : "passo/salita") });
  });
  if (typeof routeWater !== "undefined" && routeWater) {
    routeWater.forEach(function (w) {
      rows.push({ km: w.along, kind: "acqua", label: w.name || "Fontanella", extra: Math.round(w.dist) + " m dal percorso" + (w.pot === false ? " · potabilita' non garantita" : "") });
    });
  }
  if (typeof rwStops !== "undefined" && rwStops) {
    rwStops.forEach(function (s) {
      var eta = (typeof rwEtaAt === "function" && typeof rwData !== "undefined" && rwData) ? rwEtaAt(s.along) : null;
      var st = (typeof ohOpen === "function") ? ohOpen(s.oh, eta) : null;
      rows.push({
        km: s.along, kind: "ristoro", label: s.name || s.kind,
        extra: s.kind + " · " + Math.round(s.dist) + " m",
        eta: eta ? rbkClock(eta) : "", open: st
      });
    });
  }
  rows = rows.filter(function (r) { return r.km != null; });
  rows.sort(function (a, b) { return a.km - b.km; });
  return rows;
}

function buildRoadbookHTML(title) {
  var dist = trackDist(rbTrack), asc = trackAscent(rbTrack);
  var els = rbTrack.map(function (t) { return t[2]; }).filter(function (v) { return v != null; });
  var top = els.length ? Math.round(Math.max.apply(null, els)) : null;
  var name = title || (rbStops && rbStops.length ? rbStops.map(function (s) { return s.name; }).join(" · ") : "Il mio giro");
  var rows = rbkRows();
  var today = new Date();
  var ds = ("0" + today.getDate()).slice(-2) + "/" + ("0" + (today.getMonth() + 1)).slice(-2) + "/" + today.getFullYear();

  var ico = { tappa: "&#x1F4CD;", acqua: "&#x1F4A7;", ristoro: "&#x2615;" };
  var body = "";
  rows.forEach(function (r) {
    var tag = "";
    if (r.kind === "ristoro" && r.open === true) tag = '<span class="ok">aperto</span>';
    else if (r.kind === "ristoro" && r.open === false) tag = '<span class="no">chiuso</span>';
    else if (r.kind === "ristoro") tag = '<span class="unk">orario ignoto</span>';
    body += '<tr class="' + r.kind + '">'
      + '<td class="km">' + rbkNum(r.km) + '</td>'
      + '<td class="ic">' + ico[r.kind] + '</td>'
      + '<td><b>' + rbkEsc(r.label) + '</b><div class="sub">' + rbkEsc(r.extra || "") + '</div></td>'
      + '<td class="eta">' + (r.eta || "") + '</td>'
      + '<td class="tg">' + tag + '</td>'
      + '<td class="chk"></td>'
      + '</tr>';
  });

  var nWater = rows.filter(function (r) { return r.kind === "acqua"; }).length;
  var nFood = rows.filter(function (r) { return r.kind === "ristoro"; }).length;
  var note = (nWater + nFood === 0)
    ? '<div class="note">Suggerimento: prima di stampare, nel pannello del percorso attiva <b>Acqua</b> e <b>Ristori</b> (e calcola il meteo) per averli qui con gli orari.</div>'
    : '';

  return '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">'
    + '<title>Roadbook · ' + rbkEsc(name) + '</title><style>'
    + '@page{size:A4;margin:14mm}'
    + '*{box-sizing:border-box}body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;margin:0;padding:18px;font-size:12px}'
    + 'h1{font-size:19px;margin:0 0 2px}.meta{color:#64748b;font-size:11px;margin-bottom:10px}'
    + '.stats{display:flex;gap:10px;margin:10px 0}'
    + '.stats div{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:7px 9px}'
    + '.stats span{display:block;font-size:9px;letter-spacing:.5px;color:#64748b;text-transform:uppercase}'
    + '.stats b{font-size:15px}'
    + '.prof{border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:8px 0 12px}'
    + 'table{width:100%;border-collapse:collapse}'
    + 'th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;border-bottom:1.5px solid #cbd5e1;padding:5px 4px}'
    + 'td{border-bottom:1px solid #eef2f7;padding:5px 4px;vertical-align:top}'
    + 'tr{page-break-inside:avoid}'
    + '.km{width:44px;font-weight:700;color:#2563eb;white-space:nowrap}'
    + '.ic{width:20px}.eta{width:38px;font-weight:600}.tg{width:76px}'
    + '.chk{width:20px;border-left:1px solid #eef2f7}'
    + '.chk:after{content:"";display:block;width:11px;height:11px;border:1px solid #94a3b8;border-radius:3px;margin:1px auto}'
    + '.sub{color:#64748b;font-size:10px}'
    + 'tr.tappa td{background:#f8fafc}tr.tappa .km{color:#7c3aed}'
    + '.ok{color:#166534;background:#dcfce7;border-radius:20px;padding:1px 6px;font-size:9px}'
    + '.no{color:#991b1b;background:#fee2e2;border-radius:20px;padding:1px 6px;font-size:9px}'
    + '.unk{color:#64748b;background:#f1f5f9;border-radius:20px;padding:1px 6px;font-size:9px}'
    + '.note{margin-top:10px;border:1px solid #fde68a;background:#fffbeb;border-radius:8px;padding:8px 10px;font-size:10px}'
    + '.foot{margin-top:14px;border-top:1px solid #e2e8f0;padding-top:6px;color:#94a3b8;font-size:9px;display:flex;justify-content:space-between}'
    + '.bar{position:sticky;top:0;background:#2563eb;color:#fff;padding:9px 12px;border-radius:9px;margin-bottom:14px;display:flex;gap:10px;align-items:center}'
    + '.bar button{font:inherit;font-weight:600;border:none;border-radius:7px;padding:7px 14px;cursor:pointer;background:#fff;color:#1e3a5f}'
    + '@media print{.bar{display:none}body{padding:0}}'
    + '</style></head><body>'
    + '<div class="bar"><b>Roadbook pronto</b><button onclick="window.print()">Stampa / Salva come PDF</button>'
    + '<span style="font-size:11px;opacity:.9">Nella finestra di stampa scegli &laquo;Salva come PDF&raquo;.</span></div>'
    + '<h1>' + rbkEsc(name) + '</h1>'
    + '<div class="meta">LocaRide · roadbook generato il ' + ds + '</div>'
    + '<div class="stats"><div><span>Distanza</span><b>' + rbkNum(dist) + ' km</b></div>'
    + '<div><span>Dislivello</span><b>' + asc + ' m</b></div>'
    + (top != null ? '<div><span>Quota max</span><b>' + top + ' m</b></div>' : '')
    + '<div><span>Punti</span><b>' + rows.length + '</b></div></div>'
    + '<div class="prof">' + rbkProfileSvg(700, 120) + '</div>'
    + '<table><thead><tr><th>Km</th><th></th><th>Punto</th><th>Ora</th><th>Stato</th><th>&#x2713;</th></tr></thead>'
    + '<tbody>' + (body || '<tr><td colspan="6" style="color:#64748b">Nessun punto disponibile.</td></tr>') + '</tbody></table>'
    + note
    + '<div class="foot"><span>locaride.app · ride like a local</span>'
    + '<span>Orari e potabilita\' da OpenStreetMap: verifica sul posto.</span></div>'
    + '</body></html>';
}

function openRoadbook() {
  if (!rbTrack || rbTrack.length < 2) {
    if (typeof flashInfo === "function") flashInfo("Calcola o apri prima un percorso.");
    return;
  }
  var html = buildRoadbookHTML(null);
  var w = window.open("", "_blank");
  if (!w) {
    // popup bloccato: ripiego su un file HTML scaricabile, che si apre e si stampa lo stesso
    try {
      var b = new Blob([html], { type: "text/html" });
      var u = URL.createObjectURL(b);
      var a = document.createElement("a");
      a.href = u; a.download = "locaride_roadbook.html";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(u);
      if (typeof flashInfo === "function") flashInfo("Finestra bloccata dal browser: roadbook scaricato come file.");
    } catch (e) { alert("Consenti le finestre popup per aprire il roadbook."); }
    return;
  }
  w.document.open(); w.document.write(html); w.document.close();
}

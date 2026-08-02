/* ===========================================================================
   LocaRide - Roadbook stampabile (versione 2)
   ---------------------------------------------------------------------------
   Il foglio da portarsi dietro: profilo altimetrico con i servizi segnati sopra,
   previsioni ora per ora, riepilogo acqua e ristori, e la sequenza completa dei
   punti ordinati per chilometro con casella da spuntare.

   NOVITA' rispetto alla versione 1
   - sezione METEO: avvisi (temporali, freddo in discesa, pioggia), riquadri di
     sintesi e tabella oraria km per km;
   - riepilogo ACQUA in evidenza, non piu' solo righe sparse nell'elenco;
   - il profilo altimetrico mostra i segni di fontanelle e ristori;
   - impaginazione: intestazioni di tabella ripetute a ogni pagina, righe che non
     si spezzano, sezioni che iniziano su pagina nuova quando serve.

   Il PDF continua a farlo il browser ("Stampa -> Salva come PDF"): nessuna
   libreria da caricare, l'utente sceglie formato e margini, funziona da telefono.
   =========================================================================== */

function rbkNum(v, d) { return (v == null || isNaN(v)) ? "-" : (+v).toFixed(d == null ? 1 : d); }
function rbkEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function rbkClock(ms) {
  if (!ms) return "";
  var d = new Date(ms);
  return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
}
function rbkHasWeather() { return (typeof rwData !== "undefined") && rwData && rwData.length > 1; }

/* --------------------------- profilo altimetrico --------------------------- */
/* SVG: si stampa nitido a qualunque risoluzione, e ci possiamo appoggiare sopra
   i segni dei servizi cosi' si vede a colpo d'occhio dove bere e dove mangiare. */
function rbkProfileSvg(w, h) {
  var els = rbTrack.map(function (t) { return t[2]; }).filter(function (v) { return v != null; });
  if (els.length < 2) return "";
  var mn = Math.min.apply(null, els), mx = Math.max.apply(null, els), rng = Math.max(1, mx - mn);
  var cum = [0];
  for (var i = 1; i < rbTrack.length; i++) cum.push(cum[i - 1] + hav(rbTrack[i - 1][0], rbTrack[i - 1][1], rbTrack[i][0], rbTrack[i][1]));
  var tot = cum[cum.length - 1] || 1;
  var TOP = 14, BOT = h - 16, IH = BOT - TOP;
  var n = 240, pts = [];
  for (var k = 0; k < n; k++) {
    var idx = Math.round(k * (rbTrack.length - 1) / (n - 1));
    var e = rbTrack[idx][2];
    if (e == null) e = pts.length ? pts[pts.length - 1][1] : mn;
    pts.push([(k / (n - 1)) * w, e]);
  }
  var Y = function (e) { return BOT - ((e - mn) / rng) * IH; };
  var X = function (km) { return (Math.max(0, Math.min(tot, km)) / tot) * w; };

  var area = "M0," + BOT + " " + pts.map(function (p) { return "L" + p[0].toFixed(1) + "," + Y(p[1]).toFixed(1); }).join(" ") + " L" + w + "," + BOT + " Z";
  var line = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + "," + Y(p[1]).toFixed(1); }).join(" ");

  var grid = "";
  for (var g = 1; g <= 3; g++) {
    var yy = BOT - IH * g / 4, val = Math.round(mn + rng * g / 4);
    grid += '<line x1="0" y1="' + yy.toFixed(1) + '" x2="' + w + '" y2="' + yy.toFixed(1) + '" stroke="#e2e8f0" stroke-width="0.6"/>'
      + '<text x="2" y="' + (yy - 2).toFixed(1) + '" font-size="7.5" fill="#94a3b8">' + val + '</text>';
  }
  // tacche dei chilometri
  var step = tot > 120 ? 20 : tot > 60 ? 10 : tot > 25 ? 5 : 2, ticks = "";
  for (var km = step; km < tot; km += step) {
    ticks += '<line x1="' + X(km).toFixed(1) + '" y1="' + BOT + '" x2="' + X(km).toFixed(1) + '" y2="' + (BOT + 3) + '" stroke="#cbd5e1" stroke-width="0.6"/>'
      + '<text x="' + X(km).toFixed(1) + '" y="' + (h - 4) + '" font-size="7" fill="#94a3b8" text-anchor="middle">' + km + '</text>';
  }
  // segni dei servizi sopra il profilo
  var marks = "";
  if (typeof routeWater !== "undefined" && routeWater) {
    routeWater.forEach(function (wp) {
      var x = X(wp.along);
      marks += '<circle cx="' + x.toFixed(1) + '" cy="' + (TOP - 5) + '" r="2.6" fill="#2563eb"/>';
    });
  }
  if (typeof rwStops !== "undefined" && rwStops) {
    rwStops.forEach(function (st) {
      var x = X(st.along);
      marks += '<rect x="' + (x - 2.2).toFixed(1) + '" y="' + (TOP - 11) + '" width="4.4" height="4.4" rx="1" fill="#ea580c"/>';
    });
  }
  return '<svg width="100%" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="display:block">'
    + grid + ticks
    + '<path d="' + area + '" fill="#dbeafe"/>'
    + '<path d="' + line + '" fill="none" stroke="#2563eb" stroke-width="1.3"/>'
    + marks
    + '<text x="' + (w - 2) + '" y="' + (TOP - 4) + '" font-size="7.5" fill="#64748b" text-anchor="end">' + tot.toFixed(1) + ' km</text>'
    + '</svg>';
}

/* ------------------------------ dati dei punti ----------------------------- */
function rbkStopKm(s) {
  if (typeof distPtToTrack !== "function" || !rbTrack.length) return null;
  var r = distPtToTrack(s.lat, s.lon, rbTrack.map(function (c) { return [c[0], c[1]]; }));
  return r ? r.along : null;
}
function rbkEta(km) {
  if (!rbkHasWeather() || typeof rwEtaAt !== "function") return null;
  return rwEtaAt(km);
}
function rbkRows() {
  var rows = [];
  (rbStops || []).forEach(function (s, i) {
    rows.push({ km: rbkStopKm(s), kind: "tappa", label: s.name || ("Tappa " + (i + 1)), extra: (s.type === "point" ? "waypoint" : "passo / salita") });
  });
  if (typeof routeWater !== "undefined" && routeWater) {
    routeWater.forEach(function (w) {
      rows.push({
        km: w.along, kind: "acqua", label: w.name || "Fontanella",
        extra: Math.round(w.dist) + " m dal percorso" + (w.pot === false ? " · potabilita' non garantita" : "")
      });
    });
  }
  if (typeof rwStops !== "undefined" && rwStops) {
    rwStops.forEach(function (s) {
      var eta = rbkEta(s.along);
      var st = (typeof ohOpen === "function") ? ohOpen(s.oh, eta) : null;
      rows.push({
        km: s.along, kind: "ristoro", label: s.name || s.kind,
        extra: s.kind + " · " + Math.round(s.dist) + " m",
        eta: eta ? rbkClock(eta) : "", open: st
      });
    });
  }
  return rows.filter(function (r) { return r.km != null; }).sort(function (a, b) { return a.km - b.km; });
}

/* --------------------------------- meteo ----------------------------------- */
function rbkWeatherBlocks() {
  if (!rbkHasWeather()) {
    return '<div class="hint">Per avere in questo foglio <b>orari di passaggio, previsioni e ristori aperti</b>: '
      + 'nel pannello del percorso imposta ora di partenza e andatura, premi <b>Calcola</b>, '
      + 'e attiva <b>Ristori</b> e <b>Acqua</b>. Poi rigenera il roadbook.</div>';
  }
  var a = rwData, n = a.length, first = a[0], last = a[n - 1];
  var dur = (last.t - first.t) / 3600000;
  var headKm = 0, tailKm = 0, mmTot = 0, maxRain = 0, tmin = null, tmax = null;
  for (var i = 1; i < n; i++) {
    var seg = a[i].km - a[i - 1].km;
    if (a[i].kind === "head") headKm += seg; else if (a[i].kind === "tail") tailKm += seg;
    mmTot += (a[i].mm || 0) * ((a[i].t - a[i - 1].t) / 3600000);
  }
  a.forEach(function (p) {
    if (p.rain != null && p.rain > maxRain) maxRain = p.rain;
    if (p.temp != null) { if (tmin == null || p.temp < tmin) tmin = p.temp; if (tmax == null || p.temp > tmax) tmax = p.temp; }
  });
  var storm = a.filter(function (p) { return typeof isStorm === "function" && isStorm(p.code); })[0];
  var snow = a.filter(function (p) { return typeof isSnow === "function" && isSnow(p.code); })[0];
  var worst = a.reduce(function (x, p) { return (!x || p.head > x.head) ? p : x; }, null);
  var top = a.filter(function (p) { return p.top; })[0] || a.reduce(function (x, p) { return (p.ele != null && (!x || p.ele > x.ele)) ? p : x; }, null);

  var h = '<div class="sec">&#x1F4A8; Meteo del percorso</div>';
  h += '<div class="cards">'
    + '<div><span>Partenza</span><b>' + rbkClock(first.t) + '</b></div>'
    + '<div><span>Arrivo stimato</span><b>' + rbkClock(last.t) + '</b></div>'
    + '<div><span>Durata</span><b>' + dur.toFixed(1) + ' h</b></div>'
    + '<div><span>Temperatura</span><b>' + (tmin != null ? Math.round(tmin) + '/' + Math.round(tmax) + '&deg;' : '-') + '</b></div>'
    + '<div><span>Vento contrario</span><b>' + headKm.toFixed(0) + ' km</b></div>'
    + '<div><span>A favore</span><b>' + tailKm.toFixed(0) + ' km</b></div>'
    + '</div>';

  // avvisi, in ordine di importanza: prima la sicurezza
  if (storm) {
    h += '<div class="warn red">&#x26A1; <b>Temporali previsti</b> al km ' + storm.km.toFixed(0) + ' verso le ' + rbkClock(storm.t)
      + (storm.ele > 1500 ? ' — sei a ' + Math.round(storm.ele) + ' m: in cresta il fulmine cerca il punto piu\' alto. Valuta di rimandare.' : '. Cerca un riparo, non un albero.')
      + '</div>';
  }
  if (snow) h += '<div class="warn blue">&#x2744;&#xFE0F; <b>Neve</b> prevista al km ' + snow.km.toFixed(0) + ' (' + Math.round(snow.ele) + ' m) verso le ' + rbkClock(snow.t) + '.</div>';
  if (worst && worst.head >= 15) h += '<div class="warn amber">&#x1F4A8; Tratto peggiore: <b>' + Math.round(worst.head) + ' km/h in faccia</b> al km ' + worst.km.toFixed(0) + ', verso le ' + rbkClock(worst.t) + '.</div>';
  if (mmTot >= 0.3 || maxRain >= 50) {
    var sev = mmTot < 1 ? 'una spruzzata' : mmTot < 5 ? 'pioggia leggera' : mmTot < 12 ? 'pioggia vera' : 'acquazzone';
    h += '<div class="warn blue">&#x1F327;&#xFE0F; Probabilita\' fino al <b>' + maxRain + '%</b>, accumulo stimato <b>' + mmTot.toFixed(1) + ' mm</b> &rarr; ' + sev + '.</div>';
  }
  // freddo in discesa dopo la cima: e' l'avviso che salva la giornata
  if (top && top.temp != null && typeof descendSpeed === "function" && typeof apparentTemp === "function") {
    var flat = 22;
    var el = document.getElementById("rw-speed"); if (el && el.value) flat = parseInt(el.value, 10) || 22;
    var v = descendSpeed(top, flat);
    var ap = v ? apparentTemp(top.temp, top.rh, v) : null;
    if (ap != null && top.temp - ap >= 4) {
      h += '<div class="warn red">&#x1F3D4;&#xFE0F; In cima (' + Math.round(top.ele) + ' m, ore ' + rbkClock(top.t) + ') <b>' + Math.round(top.temp) + '&deg;C</b>, '
        + 'ma in discesa a ' + Math.round(v) + ' km/h percepirai <b>' + Math.round(ap) + '&deg;C</b>'
        + (ap <= 5 ? ' &rarr; giacca obbligatoria.' : ap <= 12 ? ' &rarr; porta un antivento.' : '.') + '</div>';
    }
  }

  // tabella oraria
  h += '<table class="wx"><thead><tr><th>Km</th><th>Ora</th><th>Quota</th><th>Temp</th><th>Vento</th><th>Pioggia</th><th>Cielo</th></tr></thead><tbody>';
  a.forEach(function (p) {
    var vento = "-";
    if (p.wind != null) {
      var lab = p.kind === "cross" ? "laterale" : (p.kind === "head" ? "contro" : "favore");
      var val = p.kind === "cross" ? Math.round(p.cross) : Math.round(Math.abs(p.head));
      vento = val + " km/h " + lab;
    }
    h += '<tr><td class="km">' + p.km.toFixed(1) + '</td><td>' + rbkClock(p.t) + '</td>'
      + '<td>' + (p.ele != null ? Math.round(p.ele) + ' m' : '-') + '</td>'
      + '<td>' + (p.temp != null ? Math.round(p.temp) + '&deg;' : '-') + '</td>'
      + '<td class="' + (p.kind === "head" ? "bad" : p.kind === "tail" ? "good" : "") + '">' + vento + '</td>'
      + '<td>' + (p.rain != null ? p.rain + '%' : '-') + (p.mm > 0.05 ? ' <small>' + p.mm.toFixed(1) + ' mm</small>' : '') + '</td>'
      + '<td>' + (typeof skyGlyph === "function" ? skyGlyph(p) : '') + '</td></tr>';
  });
  h += '</tbody></table>';
  h += '<div class="note">I modelli meteo hanno maglie di 2-11 km e non colgono come il vento si incanala nelle valli: in quota prendi le previsioni come indicazione.</div>';
  return h;
}

/* ------------------------------ foglio completo ---------------------------- */
function buildRoadbookHTML(title) {
  var dist = trackDist(rbTrack), asc = trackAscent(rbTrack);
  var els = rbTrack.map(function (t) { return t[2]; }).filter(function (v) { return v != null; });
  var top = els.length ? Math.round(Math.max.apply(null, els)) : null;
  var name = title || (rbStops && rbStops.length ? rbStops.map(function (s) { return s.name; }).join(" · ") : "Il mio giro");
  var rows = rbkRows();
  var today = new Date();
  var ds = ("0" + today.getDate()).slice(-2) + "/" + ("0" + (today.getMonth() + 1)).slice(-2) + "/" + today.getFullYear();

  var water = rows.filter(function (r) { return r.kind === "acqua"; });
  var food = rows.filter(function (r) { return r.kind === "ristoro"; });
  var openFood = food.filter(function (r) { return r.open === true; });
  var onRoute = water.filter(function (r) { return /^(\d+) m/.test(r.extra) && parseInt(r.extra, 10) <= 30; }).length;

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
      + '<td class="chk"></td></tr>';
  });

  var acquaBox = water.length
    ? '<div class="cards small"><div><span>Punti acqua</span><b>' + water.length + '</b></div>'
      + '<div><span>Proprio sul percorso</span><b>' + onRoute + '</b></div>'
      + '<div><span>Primo</span><b>km ' + rbkNum(water[0].km) + '</b></div>'
      + '<div><span>Ultimo</span><b>km ' + rbkNum(water[water.length - 1].km) + '</b></div></div>'
    : '<div class="hint">Nessuna fontanella trovata entro 200 m dal percorso. Se non hai ancora aperto la scheda del percorso, i punti acqua non sono stati cercati: aprila e rigenera.</div>';

  var ristoroBox = food.length
    ? '<div class="cards small"><div><span>Ristori</span><b>' + food.length + '</b></div>'
      + '<div><span>Aperti al tuo passaggio</span><b>' + (rbkHasWeather() ? openFood.length : '?') + '</b></div>'
      + '<div><span>Primo</span><b>km ' + rbkNum(food[0].km) + '</b></div>'
      + '<div><span>Ultimo</span><b>km ' + rbkNum(food[food.length - 1].km) + '</b></div></div>'
    : '<div class="hint">Nessun ristoro in elenco: attiva <b>Mostra bar, forni e alimentari</b> nel pannello del percorso e rigenera.</div>';

  return '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Roadbook · ' + rbkEsc(name) + '</title><style>'
    + '@page{size:A4;margin:13mm}'
    + '*{box-sizing:border-box}'
    + 'body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;margin:0;padding:20px;font-size:11.5px;line-height:1.45}'
    + 'h1{font-size:20px;margin:0 0 2px;letter-spacing:-.2px}'
    + '.meta{color:#64748b;font-size:10.5px;margin-bottom:12px}'
    + '.sec{font-size:12.5px;font-weight:700;color:#1e3a8a;border-bottom:2px solid #bfdbfe;padding-bottom:4px;margin:18px 0 9px}'
    + '.cards{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}'
    + '.cards div{flex:1;min-width:88px;border:1px solid #e2e8f0;border-radius:9px;padding:7px 9px;background:#f8fafc}'
    + '.cards span{display:block;font-size:8.5px;letter-spacing:.4px;color:#64748b;text-transform:uppercase}'
    + '.cards b{font-size:14.5px}'
    + '.cards.small b{font-size:13px}'
    + '.prof{border:1px solid #e2e8f0;border-radius:9px;overflow:hidden;margin:8px 0 4px;background:#fff}'
    + '.leg{display:flex;gap:14px;font-size:9px;color:#64748b;margin-bottom:10px}'
    + '.leg i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#2563eb;margin-right:4px}'
    + '.leg i.sq{border-radius:2px;background:#ea580c}'
    + 'table{width:100%;border-collapse:collapse;margin-top:4px}'
    + 'thead{display:table-header-group}'      /* intestazione ripetuta a ogni pagina */
    + 'th{text-align:left;font-size:8.5px;text-transform:uppercase;letter-spacing:.4px;color:#64748b;border-bottom:1.5px solid #cbd5e1;padding:5px 4px}'
    + 'td{border-bottom:1px solid #eef2f7;padding:5px 4px;vertical-align:top}'
    + 'tr{page-break-inside:avoid}'
    + '.km{width:42px;font-weight:700;color:#2563eb;white-space:nowrap}'
    + '.ic{width:18px}.eta{width:36px;font-weight:600}.tg{width:70px}'
    + '.chk{width:20px;border-left:1px solid #eef2f7}'
    + '.chk:after{content:"";display:block;width:11px;height:11px;border:1px solid #94a3b8;border-radius:3px;margin:1px auto}'
    + '.sub{color:#64748b;font-size:9.5px}'
    + 'tr.tappa td{background:#f5f3ff}tr.tappa .km{color:#7c3aed}'
    + 'tr.acqua .km{color:#0284c7}'
    + '.wx td{font-size:10.5px}.wx .bad{color:#b91c1c;font-weight:600}.wx .good{color:#15803d;font-weight:600}'
    + '.wx small{color:#64748b}'
    + '.ok{color:#166534;background:#dcfce7;border-radius:20px;padding:1px 6px;font-size:8.5px}'
    + '.no{color:#991b1b;background:#fee2e2;border-radius:20px;padding:1px 6px;font-size:8.5px}'
    + '.unk{color:#64748b;background:#f1f5f9;border-radius:20px;padding:1px 6px;font-size:8.5px}'
    + '.warn{border-radius:9px;padding:7px 10px;margin:6px 0;font-size:10.5px;page-break-inside:avoid}'
    + '.warn.red{background:#fef2f2;border:1px solid #fca5a5}'
    + '.warn.amber{background:#fffbeb;border:1px solid #fde68a}'
    + '.warn.blue{background:#eff6ff;border:1px solid #bfdbfe}'
    + '.hint{background:#fffbeb;border:1px solid #fde68a;border-radius:9px;padding:8px 10px;font-size:10px;margin:6px 0}'
    + '.note{color:#94a3b8;font-size:9px;margin-top:6px;line-height:1.4}'
    + '.foot{margin-top:16px;border-top:1px solid #e2e8f0;padding-top:6px;color:#94a3b8;font-size:8.5px;display:flex;justify-content:space-between}'
    + '.bar{background:#2563eb;color:#fff;padding:10px 14px;border-radius:10px;margin-bottom:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}'
    + '.bar button{font:inherit;font-weight:700;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;background:#fff;color:#1e3a5f}'
    + '.pagebreak{page-break-before:always}'
    + '@media print{.bar{display:none}body{padding:0}}'
    + '</style></head><body>'
    + '<div class="bar"><b>Roadbook pronto</b><button onclick="window.print()">Stampa / Salva come PDF</button>'
    + '<span style="font-size:10.5px;opacity:.92">Nella finestra di stampa scegli &laquo;Salva come PDF&raquo;.</span></div>'
    + '<h1>' + rbkEsc(name) + '</h1>'
    + '<div class="meta">LocaRide &middot; roadbook generato il ' + ds + '</div>'
    + '<div class="cards">'
    + '<div><span>Distanza</span><b>' + rbkNum(dist) + ' km</b></div>'
    + '<div><span>Dislivello</span><b>' + asc + ' m</b></div>'
    + (top != null ? '<div><span>Quota max</span><b>' + top + ' m</b></div>' : '')
    + '<div><span>Punti utili</span><b>' + rows.length + '</b></div></div>'
    + '<div class="prof">' + rbkProfileSvg(720, 150) + '</div>'
    + '<div class="leg"><span><i></i>fontanelle</span><span><i class="sq"></i>ristori</span><span>numeri sotto il profilo = chilometri</span></div>'
    + rbkWeatherBlocks()
    + '<div class="sec">&#x1F4A7; Acqua</div>' + acquaBox
    + '<div class="sec">&#x2615; Ristori</div>' + ristoroBox
    + '<div class="sec">&#x1F5FA;&#xFE0F; Sequenza del giro</div>'
    + '<table><thead><tr><th>Km</th><th></th><th>Punto</th><th>Ora</th><th>Stato</th><th>&#x2713;</th></tr></thead>'
    + '<tbody>' + (body || '<tr><td colspan="6" style="color:#64748b">Nessun punto disponibile.</td></tr>') + '</tbody></table>'
    + '<div class="foot"><span>locaride.app &middot; ride like a local</span>'
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
    // finestra bloccata dal browser: si scarica come file, si apre e si stampa uguale
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

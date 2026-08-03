/* ===========================================================================
   LocaRide - Roadbook stampabile (versione 4)
   ---------------------------------------------------------------------------
   COSA CAMBIA E PERCHE'
   Nella v3 avevo aggiunto i paesi attraversati ma tolto le sezioni dedicate ad
   Acqua e Ristori: il risultato era che 5 fontanelle e 3 bar finivano annegati in
   17 righe di frazioni, e sembravano spariti. Qui:
     - tornano le SEZIONI DEDICATE ad acqua e ristori, con i km in chiaro;
     - i toponimi sono DIRADATI (uno ogni ~4 km, solo quelli vicini al percorso e
       privilegiando i centri piu' importanti);
     - il profilo altimetrico porta le ETICHETTE dei passi e dei paesi principali;
     - c'e' una MAPPA PLANIMETRICA vettoriale con scala, nord, passi, acqua e ristori.

   La mappa e' disegnata in vettoriale e non usa tessere: sarebbe un problema in
   stampa (immagini esterne che il browser blocca o stampa sgranate) e servirebbero
   una dozzina di richieste. Cosi' e' nitida a qualsiasi ingrandimento.
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
function rbkCompass(d) {
  if (d == null) return "";
  var n = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
  return n[Math.round(((d % 360) / 22.5)) % 16];
}
function rbkCum() {
  var cum = [0];
  for (var i = 1; i < rbTrack.length; i++) cum.push(cum[i - 1] + hav(rbTrack[i - 1][0], rbTrack[i - 1][1], rbTrack[i][0], rbTrack[i][1]));
  return cum;
}

/* ------------------------- toponimi: pochi e utili ------------------------- */
/* 17 frazioni in fila non sono un aiuto, sono rumore che nasconde le fontanelle.
   Si tiene un riferimento ogni ~4 km, solo entro 450 m dal percorso, preferendo
   il centro piu' importante (citta' > paese > frazione). */
function rbkPlaces() {
  if (typeof routePlaces === "undefined" || !routePlaces) return [];
  var rank = { city: 3, town: 2, village: 1, hamlet: 0 };
  var f = routePlaces.filter(function (p) { return p.dist <= 450; })
    .sort(function (a, b) { return a.along - b.along; });
  var out = [];
  f.forEach(function (p) {
    var prev = out[out.length - 1];
    if (prev && (p.along - prev.along) < 4) {
      // troppo vicino al precedente: tiene il piu' importante, a parita' il piu' vicino
      var rp = rank[p.place] || 0, rq = rank[prev.place] || 0;
      if (rp > rq || (rp === rq && p.dist < prev.dist)) out[out.length - 1] = p;
      return;
    }
    out.push(p);
  });
  return out;
}
function rbkPlaceLabel(p) {
  return p.place === "city" ? "citta'" : p.place === "town" ? "paese" : "frazione";
}

/* ------------------------- profilo con le etichette ------------------------ */
function rbkProfileSvg(w, h, sel, places) {
  var els = rbTrack.map(function (t) { return t[2]; }).filter(function (v) { return v != null; });
  if (els.length < 2) return "";
  var mn = Math.min.apply(null, els), mx = Math.max.apply(null, els), rng = Math.max(1, mx - mn);
  var cum = rbkCum(), tot = cum[cum.length - 1] || 1;
  var LAB = 62;                        // fascia in alto per i nomi
  var TOP = LAB, BOT = h - 30, IH = BOT - TOP;
  var n = 240, pts = [];
  for (var k = 0; k < n; k++) {
    var idx = Math.round(k * (rbTrack.length - 1) / (n - 1));
    var e = rbTrack[idx][2];
    if (e == null) e = pts.length ? pts[pts.length - 1][1] : mn;
    pts.push([(k / (n - 1)) * w, e]);
  }
  var Y = function (e) { return BOT - ((e - mn) / rng) * IH; };
  var X = function (km) { return (Math.max(0, Math.min(tot, km)) / tot) * w; };
  var eleAt = function (km) {
    var i = 0; while (i < cum.length - 1 && cum[i] < km) i++;
    return rbTrack[i] && rbTrack[i][2] != null ? rbTrack[i][2] : mn;
  };

  var area = "M0," + BOT + " " + pts.map(function (p) { return "L" + p[0].toFixed(1) + "," + Y(p[1]).toFixed(1); }).join(" ") + " L" + w + "," + BOT + " Z";
  var line = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + "," + Y(p[1]).toFixed(1); }).join(" ");

  var grid = "";
  for (var g = 1; g <= 3; g++) {
    var yy = BOT - IH * g / 4, val = Math.round(mn + rng * g / 4);
    grid += '<line x1="0" y1="' + yy.toFixed(1) + '" x2="' + w + '" y2="' + yy.toFixed(1) + '" stroke="#e2e8f0" stroke-width="0.6"/>'
      + '<text x="2" y="' + (yy - 2).toFixed(1) + '" font-size="7.5" fill="#94a3b8">' + val + '</text>';
  }
  var step = tot > 120 ? 20 : tot > 60 ? 10 : tot > 25 ? 5 : 2, ticks = "";
  for (var km = step; km < tot; km += step) {
    ticks += '<line x1="' + X(km).toFixed(1) + '" y1="' + BOT + '" x2="' + X(km).toFixed(1) + '" y2="' + (BOT + 3) + '" stroke="#cbd5e1" stroke-width="0.6"/>'
      + '<text x="' + X(km).toFixed(1) + '" y="' + (BOT + 12) + '" font-size="7.5" fill="#94a3b8" text-anchor="middle">' + km + '</text>';
  }

  /* Etichette in alto: prima i passi/tappe (importanti), poi i paesi se resta
     spazio. Si scarta chi cadrebbe addosso all'etichetta precedente. */
  var labels = [];
  (rbStops || []).forEach(function (s, i) {
    var km = rbkStopKm(s);
    if (km == null) return;
    labels.push({ km: km, name: s.name || ("Tappa " + (i + 1)), major: s.type !== "point" });
  });
  (places || []).forEach(function (p) { labels.push({ km: p.along, name: p.name, major: false }); });
  labels.sort(function (a, b) { return a.km - b.km; });
  var placed = [], lastX = -999;
  labels.forEach(function (l) {
    var x = X(l.km);
    if (x - lastX < 13 && !l.major) return;          // troppo vicine: il paese cede il posto
    if (x - lastX < 9) return;
    placed.push(l); lastX = x;
  });

  var lab = "";
  placed.forEach(function (l) {
    var x = X(l.km), ey = Y(eleAt(l.km));
    var col = l.major ? "#7c3aed" : "#64748b";
    var nome = l.name.length > 22 ? l.name.slice(0, 21) + "…" : l.name;
    lab += '<line x1="' + x.toFixed(1) + '" y1="' + (LAB - 4) + '" x2="' + x.toFixed(1) + '" y2="' + ey.toFixed(1) + '" stroke="' + col + '" stroke-width="0.7" stroke-dasharray="2,2" opacity="0.65"/>'
      + '<circle cx="' + x.toFixed(1) + '" cy="' + ey.toFixed(1) + '" r="' + (l.major ? 2.6 : 1.8) + '" fill="' + col + '"/>'
      + '<text transform="rotate(-90 ' + x.toFixed(1) + ' ' + (LAB - 7) + ')" x="' + x.toFixed(1) + '" y="' + (LAB - 7) + '" '
      + 'font-size="' + (l.major ? 8.5 : 7.5) + '" fill="' + col + '" font-weight="' + (l.major ? 700 : 400) + '">' + rbkEsc(nome) + '</text>';
  });

  /* Servizi: fascia sotto il profilo, con il km sotto ogni segno. */
  var svc = "";
  (sel && sel.water ? sel.water : []).forEach(function (wp) {
    var x = X(wp.along);
    svc += '<circle cx="' + x.toFixed(1) + '" cy="' + (BOT + 20) + '" r="3.2" fill="#2563eb"/>'
      + '<text x="' + x.toFixed(1) + '" y="' + (BOT + 29) + '" font-size="6.5" fill="#2563eb" text-anchor="middle">' + wp.along.toFixed(0) + '</text>';
  });
  (sel && sel.food ? sel.food : []).forEach(function (st) {
    var x = X(st.along);
    svc += '<rect x="' + (x - 3).toFixed(1) + '" y="' + (BOT + 17) + '" width="6" height="6" rx="1.2" fill="#ea580c"/>'
      + '<text x="' + x.toFixed(1) + '" y="' + (BOT + 29) + '" font-size="6.5" fill="#ea580c" text-anchor="middle">' + st.along.toFixed(0) + '</text>';
  });

  return '<svg width="100%" viewBox="0 0 ' + w + ' ' + (h + 4) + '" style="display:block">'
    + grid + ticks
    + '<path d="' + area + '" fill="#dbeafe"/>'
    + '<path d="' + line + '" fill="none" stroke="#2563eb" stroke-width="1.4"/>'
    + lab + svc
    + '<text x="' + (w - 2) + '" y="' + (LAB - 52) + '" font-size="8" fill="#64748b" text-anchor="end">' + tot.toFixed(1) + ' km &middot; ' + Math.round(mn) + '-' + Math.round(mx) + ' m</text>'
    + '</svg>';
}

/* --------------------------- mappa planimetrica ---------------------------- */
/* Vettoriale: nitida in stampa, nessuna immagine esterna da scaricare. */
function rbkPlanSvg(w, h, sel, places) {
  if (!rbTrack || rbTrack.length < 2) return "";
  var minLa = 90, maxLa = -90, minLo = 180, maxLo = -180;
  rbTrack.forEach(function (p) {
    if (p[0] < minLa) minLa = p[0]; if (p[0] > maxLa) maxLa = p[0];
    if (p[1] < minLo) minLo = p[1]; if (p[1] > maxLo) maxLo = p[1];
  });
  var midLa = (minLa + maxLa) / 2, kx = Math.cos(midLa * Math.PI / 180);
  var dLa = Math.max(1e-6, maxLa - minLa), dLo = Math.max(1e-6, (maxLo - minLo) * kx);
  var pad = 26;
  var sc = Math.min((w - pad * 2) / dLo, (h - pad * 2) / dLa);
  var offX = pad + ((w - pad * 2) - dLo * sc) / 2;
  var offY = pad + ((h - pad * 2) - dLa * sc) / 2;
  var P = function (la, lo) { return [offX + ((lo - minLo) * kx) * sc, offY + (maxLa - la) * sc]; };

  var d = "";
  for (var i = 0; i < rbTrack.length; i += Math.max(1, Math.floor(rbTrack.length / 900))) {
    var q = P(rbTrack[i][0], rbTrack[i][1]);
    d += (d ? "L" : "M") + q[0].toFixed(1) + "," + q[1].toFixed(1) + " ";
  }
  var last = P(rbTrack[rbTrack.length - 1][0], rbTrack[rbTrack.length - 1][1]);
  d += "L" + last[0].toFixed(1) + "," + last[1].toFixed(1);

  var marks = "";
  (places || []).forEach(function (p) {
    if (p.lat == null) return;
    var q = P(p.lat, p.lon);
    marks += '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="1.8" fill="#94a3b8"/>'
      + '<text x="' + (q[0] + 3.5).toFixed(1) + '" y="' + (q[1] + 2.5).toFixed(1) + '" font-size="6.5" fill="#64748b">' + rbkEsc(p.name.slice(0, 16)) + '</text>';
  });
  (sel && sel.water ? sel.water : []).forEach(function (wp) {
    if (wp.lat == null) return;
    var q = P(wp.lat, wp.lon);
    marks += '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="3" fill="#2563eb" stroke="#fff" stroke-width="1"/>';
  });
  (sel && sel.food ? sel.food : []).forEach(function (st) {
    if (st.lat == null) return;
    var q = P(st.lat, st.lon);
    marks += '<rect x="' + (q[0] - 2.8).toFixed(1) + '" y="' + (q[1] - 2.8).toFixed(1) + '" width="5.6" height="5.6" rx="1.2" fill="#ea580c" stroke="#fff" stroke-width="1"/>';
  });
  (rbStops || []).forEach(function (s, i) {
    var q = P(s.lat, s.lon);
    var col = (i === 0) ? "#16a34a" : (i === rbStops.length - 1) ? "#dc2626" : "#7c3aed";
    marks += '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="4.6" fill="' + col + '" stroke="#fff" stroke-width="1.4"/>'
      + '<text x="' + q[0].toFixed(1) + '" y="' + (q[1] + 2.4).toFixed(1) + '" font-size="6" fill="#fff" text-anchor="middle" font-weight="700">' + (i + 1) + '</text>';
  });

  // barra di scala: sceglie una distanza tonda
  var kmPerPx = 1 / (sc * 111.32);
  var target = (w - pad * 2) * 0.28 * kmPerPx;
  var nice = [1, 2, 5, 10, 20, 50, 100], barKm = nice[0];
  for (var z = 0; z < nice.length; z++) if (nice[z] <= target) barKm = nice[z];
  var barPx = barKm / kmPerPx;
  var bx = pad, by = h - 12;
  var scale = '<line x1="' + bx + '" y1="' + by + '" x2="' + (bx + barPx).toFixed(1) + '" y2="' + by + '" stroke="#0f172a" stroke-width="1.6"/>'
    + '<line x1="' + bx + '" y1="' + (by - 3) + '" x2="' + bx + '" y2="' + (by + 3) + '" stroke="#0f172a" stroke-width="1.6"/>'
    + '<line x1="' + (bx + barPx).toFixed(1) + '" y1="' + (by - 3) + '" x2="' + (bx + barPx).toFixed(1) + '" y2="' + (by + 3) + '" stroke="#0f172a" stroke-width="1.6"/>'
    + '<text x="' + (bx + barPx / 2).toFixed(1) + '" y="' + (by - 5) + '" font-size="7.5" fill="#0f172a" text-anchor="middle">' + barKm + ' km</text>';
  // nord
  var nx = w - 20, ny = 20;
  var north = '<path d="M' + nx + ',' + (ny + 9) + ' L' + nx + ',' + (ny - 7) + '" stroke="#0f172a" stroke-width="1.4"/>'
    + '<path d="M' + (nx - 3.4) + ',' + (ny - 3) + ' L' + nx + ',' + (ny - 8.5) + ' L' + (nx + 3.4) + ',' + (ny - 3) + ' Z" fill="#0f172a"/>'
    + '<text x="' + nx + '" y="' + (ny + 17) + '" font-size="7.5" fill="#0f172a" text-anchor="middle" font-weight="700">N</text>';

  return '<svg width="100%" viewBox="0 0 ' + w + ' ' + h + '" style="display:block">'
    + '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="#fbfdff"/>'
    + '<path d="' + d + '" fill="none" stroke="#93c5fd" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>'
    + '<path d="' + d + '" fill="none" stroke="#2563eb" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>'
    + marks + scale + north + '</svg>';
}

/* ------------------------------ righe del giro ----------------------------- */
function rbkStopKm(s) {
  if (typeof distPtToTrack !== "function" || !rbTrack.length) return null;
  var r = distPtToTrack(s.lat, s.lon, rbTrack.map(function (c) { return [c[0], c[1]]; }));
  return r ? r.along : null;
}
function rbkEta(km) {
  if (!rbkHasWeather() || typeof rwEtaAt !== "function") return null;
  return rwEtaAt(km);
}
function rbkRows(sel, places) {
  var rows = [];
  (rbStops || []).forEach(function (s, i) {
    rows.push({ km: rbkStopKm(s), kind: "tappa", label: s.name || ("Tappa " + (i + 1)), extra: (s.type === "point" ? "waypoint" : "passo / salita") });
  });
  (places || []).forEach(function (p) {
    rows.push({ km: p.along, kind: "luogo", label: p.name, extra: rbkPlaceLabel(p) + " &middot; " + Math.round(p.dist) + " m" });
  });
  (sel && sel.water ? sel.water : []).forEach(function (w) {
    rows.push({
      km: w.along, kind: "acqua", label: w.name || "Fontanella",
      extra: Math.round(w.dist) + " m dal percorso" + (w.pot === "Acqua potabile" ? "" : " &middot; " + (w.pot || ""))
    });
  });
  (sel && sel.food ? sel.food : []).forEach(function (s) {
    var eta = rbkEta(s.along);
    rows.push({
      km: s.along, kind: "ristoro", label: s.name || s.kind,
      extra: s.kind + " &middot; " + Math.round(s.dist) + " m",
      eta: eta ? rbkClock(eta) : "", open: s.open
    });
  });
  return rows.filter(function (r) { return r.km != null; }).sort(function (a, b) { return a.km - b.km; });
}

/* --------------------------------- meteo + sole ---------------------------- */
function rbkWeatherBlocks() {
  if (!rbkHasWeather()) {
    return '<div class="hint">Per avere <b>orari di passaggio, previsioni, sole e ristori aperti</b>: '
      + 'nel pannello del percorso imposta ora di partenza e andatura, premi <b>Calcola</b>, '
      + 'attiva <b>Ristori</b>, poi rigenera il roadbook.</div>';
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
  var sun = (typeof ppSunTimes === "function") ? ppSunTimes(first.lat, first.lon, first.t) : null;

  var h = '<div class="sec">&#x1F4A8; Meteo, vento e sole</div>';
  h += '<div class="cards">'
    + '<div><span>Partenza</span><b>' + rbkClock(first.t) + '</b></div>'
    + '<div><span>Arrivo stimato</span><b>' + rbkClock(last.t) + '</b></div>'
    + '<div><span>Durata</span><b>' + dur.toFixed(1) + ' h</b></div>'
    + '<div><span>Temperatura</span><b>' + (tmin != null ? Math.round(tmin) + '/' + Math.round(tmax) + '&deg;' : '-') + '</b></div>'
    + (sun && sun.alba ? '<div><span>Alba</span><b>' + rbkClock(sun.alba) + '</b></div>' : '')
    + (sun && sun.tramonto ? '<div><span>Tramonto</span><b>' + rbkClock(sun.tramonto) + '</b></div>' : '')
    + '<div><span>Contrario</span><b>' + headKm.toFixed(0) + ' km</b></div>'
    + '<div><span>A favore</span><b>' + tailKm.toFixed(0) + ' km</b></div>'
    + '</div>';

  if (sun && sun.tramonto && last.t > sun.tramonto - 20 * 60000) {
    var dopo = Math.round((last.t - sun.tramonto) / 60000);
    h += '<div class="warn red">&#x1F526; <b>Arrivi ' + (dopo > 0 ? 'dopo il tramonto (' + dopo + ' min)' : 'a ridosso del tramonto') + '</b>: '
      + 'porta luci anteriore e posteriore. In montagna il buio in valle arriva prima dell\'orario ufficiale.</div>';
  }
  if (storm) {
    h += '<div class="warn red">&#x26A1; <b>Temporali previsti</b> al km ' + storm.km.toFixed(0) + ' verso le ' + rbkClock(storm.t)
      + (storm.ele > 1500 ? ' &mdash; sei a ' + Math.round(storm.ele) + ' m: in cresta il fulmine cerca il punto piu\' alto. Valuta di rimandare.' : '. Cerca un riparo, non un albero.')
      + '</div>';
  }
  if (snow) h += '<div class="warn blue">&#x2744;&#xFE0F; <b>Neve</b> prevista al km ' + snow.km.toFixed(0) + ' (' + Math.round(snow.ele) + ' m) verso le ' + rbkClock(snow.t) + '.</div>';
  if (worst && worst.head >= 15) h += '<div class="warn amber">&#x1F4A8; Tratto peggiore: <b>' + Math.round(worst.head) + ' km/h in faccia</b> al km ' + worst.km.toFixed(0) + ' verso le ' + rbkClock(worst.t) + ' (da ' + rbkCompass(worst.dir) + ').</div>';
  if (mmTot >= 0.3 || maxRain >= 50) {
    var sev = mmTot < 1 ? 'una spruzzata' : mmTot < 5 ? 'pioggia leggera' : mmTot < 12 ? 'pioggia vera' : 'acquazzone';
    h += '<div class="warn blue">&#x1F327;&#xFE0F; Probabilita\' fino al <b>' + maxRain + '%</b>, accumulo stimato <b>' + mmTot.toFixed(1) + ' mm</b> &rarr; ' + sev + '.</div>';
  }
  if (top && top.temp != null && typeof descendSpeed === "function" && typeof apparentTemp === "function") {
    var flat = (typeof ppPace === "function") ? ppPace() : 22;
    var v = descendSpeed(top, flat);
    var ap = v ? apparentTemp(top.temp, top.rh, v) : null;
    if (ap != null && top.temp - ap >= 4) {
      h += '<div class="warn red">&#x1F3D4;&#xFE0F; In cima (' + Math.round(top.ele) + ' m, ore ' + rbkClock(top.t) + ') <b>' + Math.round(top.temp) + '&deg;C</b>, '
        + 'ma in discesa a ' + Math.round(v) + ' km/h percepirai <b>' + Math.round(ap) + '&deg;C</b>'
        + (ap <= 5 ? ' &rarr; giacca obbligatoria.' : ap <= 12 ? ' &rarr; porta un antivento.' : '.') + '</div>';
    }
  }

  h += '<table class="wx"><thead><tr><th>Km</th><th>Ora</th><th>Quota</th><th>Temp</th><th>Vento</th><th>Raff.</th><th>Sole</th><th>Pioggia</th></tr></thead><tbody>';
  a.forEach(function (p) {
    var vento = "-";
    if (p.wind != null) {
      var lb = p.kind === "cross" ? "lat." : (p.kind === "head" ? "contro" : "favore");
      var val = p.kind === "cross" ? Math.round(p.cross) : Math.round(Math.abs(p.head));
      vento = val + " " + lb + "<div class='sub2'>da " + rbkCompass(p.dir) + "</div>";
    }
    var sole = "-";
    if (typeof ppSunAt === "function") {
      var s = ppSunAt(p.lat, p.lon, p.t, p.bearing);
      if (s) {
        sole = s.kind === "buio" ? "&#x1F311; buio" : s.kind === "basso" ? "&#x1F307; radente"
          : (s.kind === "faccia" ? "&#x2600;&#xFE0F; in faccia" : s.kind === "spalle" ? "&#x2600;&#xFE0F; di spalle" : "&#x2600;&#xFE0F; laterale");
        if (s.kind !== "buio") sole += "<div class='sub2'>" + Math.round(s.alt) + "&deg;</div>";
      }
    }
    h += '<tr><td class="km">' + p.km.toFixed(1) + '</td><td>' + rbkClock(p.t) + '</td>'
      + '<td>' + (p.ele != null ? Math.round(p.ele) + ' m' : '-') + '</td>'
      + '<td>' + (p.temp != null ? Math.round(p.temp) + '&deg;' : '-') + '</td>'
      + '<td class="' + (p.kind === "head" ? "bad" : p.kind === "tail" ? "good" : "") + '">' + vento + '</td>'
      + '<td>' + (p.gust != null ? Math.round(p.gust) : '-') + '</td>'
      + '<td>' + sole + '</td>'
      + '<td>' + (p.rain != null ? p.rain + '%' : '-') + (p.mm > 0.05 ? ' <small>' + p.mm.toFixed(1) + ' mm</small>' : '') + '</td></tr>';
  });
  h += '</tbody></table>';
  h += '<div class="note">Vento e sole sono relativi alla <b>direzione di marcia</b>. La posizione del sole e\' un calcolo astronomico esatto; le previsioni hanno maglie di 2-11 km e non colgono come il vento si incanala nelle valli.</div>';
  return h;
}

/* ------------------------- tabelle acqua e ristori -------------------------- */
function rbkWaterSection(sel) {
  var w = (sel && sel.water) ? sel.water : [];
  if (!w.length) {
    return '<div class="hint">Nessun punto acqua in elenco. Se hai appena aperto il percorso attendi qualche secondo e rigenera: '
      + 'la ricerca delle fontanelle parte da sola.</div>';
  }
  var onRoute = w.filter(function (x) { return x.dist <= 30; }).length;
  var h = '<div class="cards small"><div><span>Punti acqua</span><b>' + w.length + '</b></div>'
    + '<div><span>Sul percorso</span><b>' + onRoute + '</b></div>'
    + '<div><span>Primo</span><b>km ' + rbkNum(w[0].km != null ? w[0].km : w[0].along) + '</b></div>'
    + '<div><span>Ultimo</span><b>km ' + rbkNum(w[w.length - 1].along) + '</b></div></div>';
  h += '<table class="svc"><thead><tr><th>Km</th><th>Fontanella</th><th>Dal percorso</th><th>Ora</th><th>&#x2713;</th></tr></thead><tbody>';
  w.forEach(function (x) {
    var eta = rbkEta(x.along);
    h += '<tr><td class="km">' + rbkNum(x.along) + '</td>'
      + '<td><b>' + rbkEsc(x.name || "Fontanella") + '</b>' + (x.pot && x.pot !== "Acqua potabile" ? '<div class="sub">' + rbkEsc(x.pot) + '</div>' : '') + '</td>'
      + '<td>' + Math.round(x.dist) + ' m</td>'
      + '<td class="eta">' + (eta ? rbkClock(eta) : '') + '</td><td class="chk"></td></tr>';
  });
  return h + '</tbody></table>';
}
function rbkFoodSection(sel) {
  var f = (sel && sel.food) ? sel.food : [];
  if (!f.length) {
    return '<div class="hint">Nessun ristoro in elenco: attiva <b>Mostra bar, forni e alimentari</b> nel pannello del percorso e rigenera.</div>';
  }
  var open = f.filter(function (x) { return x.open === true; }).length;
  var h = '<div class="cards small"><div><span>Ristori</span><b>' + f.length + '</b></div>'
    + '<div><span>Aperti al passaggio</span><b>' + (rbkHasWeather() ? open : '?') + '</b></div>'
    + '<div><span>Primo</span><b>km ' + rbkNum(f[0].along) + '</b></div>'
    + '<div><span>Ultimo</span><b>km ' + rbkNum(f[f.length - 1].along) + '</b></div></div>';
  h += '<table class="svc"><thead><tr><th>Km</th><th>Locale</th><th>Tipo</th><th>Dal perc.</th><th>Ora</th><th>Stato</th><th>&#x2713;</th></tr></thead><tbody>';
  f.forEach(function (x) {
    var eta = rbkEta(x.along);
    var tag = x.open === true ? '<span class="ok">aperto</span>' : x.open === false ? '<span class="no">chiuso</span>' : '<span class="unk">ignoto</span>';
    h += '<tr><td class="km">' + rbkNum(x.along) + '</td>'
      + '<td><b>' + rbkEsc(x.name || x.kind) + '</b></td>'
      + '<td>' + rbkEsc(x.kind || "") + '</td>'
      + '<td>' + Math.round(x.dist) + ' m</td>'
      + '<td class="eta">' + (eta ? rbkClock(eta) : '') + '</td>'
      + '<td class="tg">' + tag + '</td><td class="chk"></td></tr>';
  });
  return h + '</tbody></table>';
}

/* ------------------------------ foglio completo ---------------------------- */
function buildRoadbookHTML(title) {
  var sel = (typeof selectPOIs === "function") ? selectPOIs() : { water: [], food: [], mode: "all" };
  var places = rbkPlaces();
  var dist = trackDist(rbTrack), asc = trackAscent(rbTrack);
  var els = rbTrack.map(function (t) { return t[2]; }).filter(function (v) { return v != null; });
  var top = els.length ? Math.round(Math.max.apply(null, els)) : null;
  var name = title || (rbStops && rbStops.length ? rbStops.map(function (s) { return s.name; }).join(" · ") : "Il mio giro");
  var rows = rbkRows(sel, places);
  var today = new Date();
  var ds = ("0" + today.getDate()).slice(-2) + "/" + ("0" + (today.getMonth() + 1)).slice(-2) + "/" + today.getFullYear();

  var whenEl = document.getElementById("rw-when"), partenza = "";
  if (whenEl && whenEl.value) {
    var d0 = new Date(whenEl.value);
    if (!isNaN(d0.getTime())) {
      var gg = ["domenica", "lunedi'", "martedi'", "mercoledi'", "giovedi'", "venerdi'", "sabato"];
      var mm = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
      partenza = gg[d0.getDay()] + " " + d0.getDate() + " " + mm[d0.getMonth()] + " " + d0.getFullYear()
        + " alle " + ("0" + d0.getHours()).slice(-2) + ":" + ("0" + d0.getMinutes()).slice(-2);
    }
  }
  var pace = (typeof ppPace === "function") ? ppPace() : 22;

  var ico = { tappa: "&#x1F4CD;", luogo: "&#x1F3D8;&#xFE0F;", acqua: "&#x1F4A7;", ristoro: "&#x2615;" };
  var body = "";
  rows.forEach(function (r) {
    var tag = "";
    if (r.kind === "ristoro" && r.open === true) tag = '<span class="ok">aperto</span>';
    else if (r.kind === "ristoro" && r.open === false) tag = '<span class="no">chiuso</span>';
    else if (r.kind === "ristoro") tag = '<span class="unk">ignoto</span>';
    body += '<tr class="' + r.kind + '">'
      + '<td class="km">' + rbkNum(r.km) + '</td>'
      + '<td class="ic">' + ico[r.kind] + '</td>'
      + '<td><b>' + rbkEsc(r.label) + '</b><div class="sub">' + r.extra + '</div></td>'
      + '<td class="eta">' + (r.eta || "") + '</td>'
      + '<td class="tg">' + tag + '</td>'
      + '<td class="chk"></td></tr>';
  });

  var inf = sel.info, fab = "";
  if (inf) {
    fab = '<div class="cards small">'
      + '<div><span>Energia stimata</span><b>' + inf.kcal.toLocaleString("it-IT") + ' kcal</b></div>'
      + '<div><span>Liquidi</span><b>' + inf.liters + ' l</b></div>'
      + '<div><span>Carboidrati</span><b>' + inf.carbsG + ' g</b></div>'
      + '<div><span>Tempo in sella</span><b>' + inf.hours.toFixed(1) + ' h</b></div></div>'
      + '<div class="note">Stima con ciclista+bici 80 kg ed efficienza 23%: serve a decidere cosa mettere in tasca '
      + '(circa ' + Math.max(1, Math.round(inf.carbsG / 25)) + ' barrette e ' + Math.max(1, Math.ceil(inf.liters / 0.75)) + ' borracce), non e\' una misura.</div>';
  }
  var selNote = (typeof ppSummaryText === "function") ? ppSummaryText(sel) : "";

  return '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Roadbook · ' + rbkEsc(name) + '</title><style>'
    + '@page{size:A4;margin:12mm}'
    + '*{box-sizing:border-box}'
    + 'body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;margin:0;padding:18px;font-size:11.5px;line-height:1.45}'
    + 'h1{font-size:19px;margin:0 0 2px;letter-spacing:-.2px}'
    + '.meta{color:#64748b;font-size:10.5px;margin-bottom:4px}'
    + '.dep{background:#eff6ff;border:1px solid #bfdbfe;border-radius:9px;padding:8px 11px;margin:8px 0;font-size:11px}'
    + '.sec{font-size:12.5px;font-weight:700;color:#1e3a8a;border-bottom:2px solid #bfdbfe;padding-bottom:4px;margin:16px 0 8px}'
    + '.cards{display:flex;gap:7px;flex-wrap:wrap;margin:8px 0}'
    + '.cards div{flex:1;min-width:84px;border:1px solid #e2e8f0;border-radius:9px;padding:6px 9px;background:#f8fafc}'
    + '.cards span{display:block;font-size:8.5px;letter-spacing:.4px;color:#64748b;text-transform:uppercase}'
    + '.cards b{font-size:14px}.cards.small b{font-size:12.5px}'
    + '.prof,.plan{border:1px solid #e2e8f0;border-radius:9px;overflow:hidden;margin:8px 0 4px;background:#fff}'
    + '.leg{display:flex;gap:14px;font-size:9px;color:#64748b;margin-bottom:8px;flex-wrap:wrap}'
    + '.leg i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#2563eb;margin-right:4px}'
    + '.leg i.sq{border-radius:2px;background:#ea580c}.leg i.pu{background:#7c3aed}.leg i.gr{background:#16a34a}'
    + 'table{width:100%;border-collapse:collapse;margin-top:4px}'
    + 'thead{display:table-header-group}'
    + 'th{text-align:left;font-size:8.5px;text-transform:uppercase;letter-spacing:.4px;color:#64748b;border-bottom:1.5px solid #cbd5e1;padding:5px 4px}'
    + 'td{border-bottom:1px solid #eef2f7;padding:5px 4px;vertical-align:top}'
    + 'tr{page-break-inside:avoid}'
    + '.km{width:42px;font-weight:700;color:#2563eb;white-space:nowrap}'
    + '.ic{width:18px}.eta{width:36px;font-weight:600}.tg{width:60px}'
    + '.chk{width:20px;border-left:1px solid #eef2f7}'
    + '.chk:after{content:"";display:block;width:11px;height:11px;border:1px solid #94a3b8;border-radius:3px;margin:1px auto}'
    + '.sub{color:#64748b;font-size:9.5px}.sub2{color:#94a3b8;font-size:8.5px}'
    + '.svc tbody tr:nth-child(odd) td{background:#f8fbff}'
    + 'tr.tappa td{background:#f5f3ff}tr.tappa .km{color:#7c3aed}tr.tappa b{color:#5b21b6}'
    + 'tr.luogo td{background:#fff}tr.luogo .km{color:#94a3b8}tr.luogo b{font-weight:400;color:#64748b;font-size:10.5px}'
    + 'tr.acqua td{background:#f0f9ff}tr.acqua .km{color:#0284c7}'
    + 'tr.ristoro td{background:#fff7ed}tr.ristoro .km{color:#ea580c}'
    + '.wx td{font-size:10px}.wx .bad{color:#b91c1c;font-weight:600}.wx .good{color:#15803d;font-weight:600}'
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
    + '.foot{margin-top:14px;border-top:1px solid #e2e8f0;padding-top:6px;color:#94a3b8;font-size:8.5px;display:flex;justify-content:space-between}'
    + '.bar{background:#2563eb;color:#fff;padding:10px 14px;border-radius:10px;margin-bottom:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}'
    + '.bar button{font:inherit;font-weight:700;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;background:#fff;color:#1e3a5f}'
    + '.brk{page-break-before:always}'
    + '@media print{.bar{display:none}body{padding:0}}'
    + '</style></head><body>'
    + '<div class="bar"><b>Roadbook pronto</b><button onclick="window.print()">Stampa / Salva come PDF</button>'
    + '<span style="font-size:10.5px;opacity:.92">Nella finestra di stampa scegli &laquo;Salva come PDF&raquo;.</span></div>'
    + '<h1>' + rbkEsc(name) + '</h1>'
    + '<div class="meta">LocaRide &middot; generato il ' + ds + '</div>'
    + (partenza ? '<div class="dep">&#x1F6B4; <b>Partenza:</b> ' + partenza + ' &middot; andatura impostata <b>' + pace + ' km/h</b> in piano</div>' : '')
    + '<div class="cards">'
    + '<div><span>Distanza</span><b>' + rbkNum(dist) + ' km</b></div>'
    + '<div><span>Dislivello</span><b>' + asc + ' m</b></div>'
    + (top != null ? '<div><span>Quota max</span><b>' + top + ' m</b></div>' : '')
    + '<div><span>Acqua</span><b>' + (sel.water || []).length + '</b></div>'
    + '<div><span>Ristori</span><b>' + (sel.food || []).length + '</b></div></div>'
    + '<div class="prof">' + rbkProfileSvg(720, 240, sel, places) + '</div>'
    + '<div class="leg"><span><i class="pu"></i>passi e tappe</span><span><i></i>acqua (km sotto)</span><span><i class="sq"></i>ristori (km sotto)</span></div>'
    + '<div class="sec">&#x1F5FA;&#xFE0F; Mappa del giro</div>'
    + '<div class="plan">' + rbkPlanSvg(720, 430, sel, places) + '</div>'
    + '<div class="leg"><span><i class="gr"></i>partenza</span><span><i class="pu"></i>tappe</span><span><i></i>acqua</span><span><i class="sq"></i>ristori</span><span>i numeri corrispondono alle tappe in elenco</span></div>'
    + '<div class="brk"></div>'
    + rbkWeatherBlocks()
    + '<div class="sec">&#x1F4A7; Dove trovare acqua</div>' + rbkWaterSection(sel)
    + '<div class="sec">&#x2615; Dove mangiare</div>' + rbkFoodSection(sel)
    + '<div class="sec">&#x1F392; Fabbisogno stimato</div>' + fab
    + '<div class="sec">&#x1F4CB; Sequenza completa</div>'
    + '<div class="note" style="margin:0 0 4px">' + selNote + '</div>'
    + '<div class="note" style="margin-top:0">Mostrati <b>' + (sel.water || []).length + '</b> punti acqua su ' + (sel.totalWater || 0)
    + ' e <b>' + (sel.food || []).length + '</b> ristori su ' + (sel.totalFood || 0) + ' trovati; i paesi sono diradati a uno ogni ~4 km.</div>'
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
  if (typeof flashInfo === "function") flashInfo("Preparo il roadbook&#8230;");
  if (typeof loadRoutePlaces === "function") loadRoutePlaces(function () { rbkOpenWindow(); });
  else rbkOpenWindow();
}
function rbkOpenWindow() {
  var html = buildRoadbookHTML(null);
  if (typeof flashInfo === "function") flashInfo("");
  var w = window.open("", "_blank");
  if (!w) {
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

/* ===========================================================================
   LocaRide - Roadbook stampabile (versione 3)
   ---------------------------------------------------------------------------
   Novita' rispetto alla v2:
   - blocco PARTENZA con data, ora e andatura scelte
   - SOLE: alba/tramonto, e per ogni ora se lo avrai in faccia, di spalle o
     laterale; avviso se arrivi dopo il tramonto
   - VENTO con direzione in lettere e raffiche
   - TOPONIMI: i paesi attraversati, cosi' il foglio non e' muto tra un passo e l'altro
   - PUNTI UTILI selezionati secondo la modalita' scelta (tutti / essenziali /
     solo acqua / nessuno) invece di elencarne 115
   - stima di energia e liquidi come informazione per preparare le tasche

   Il PDF continua a farlo il browser ("Stampa -> Salva come PDF").
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

/* --------------------------- profilo altimetrico --------------------------- */
function rbkProfileSvg(w, h, sel) {
  var els = rbTrack.map(function (t) { return t[2]; }).filter(function (v) { return v != null; });
  if (els.length < 2) return "";
  var mn = Math.min.apply(null, els), mx = Math.max.apply(null, els), rng = Math.max(1, mx - mn);
  var cum = [0];
  for (var i = 1; i < rbTrack.length; i++) cum.push(cum[i - 1] + hav(rbTrack[i - 1][0], rbTrack[i - 1][1], rbTrack[i][0], rbTrack[i][1]));
  var tot = cum[cum.length - 1] || 1;
  var TOP = 16, BOT = h - 16, IH = BOT - TOP;
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
  var step = tot > 120 ? 20 : tot > 60 ? 10 : tot > 25 ? 5 : 2, ticks = "";
  for (var km = step; km < tot; km += step) {
    ticks += '<line x1="' + X(km).toFixed(1) + '" y1="' + BOT + '" x2="' + X(km).toFixed(1) + '" y2="' + (BOT + 3) + '" stroke="#cbd5e1" stroke-width="0.6"/>'
      + '<text x="' + X(km).toFixed(1) + '" y="' + (h - 4) + '" font-size="7" fill="#94a3b8" text-anchor="middle">' + km + '</text>';
  }
  var marks = "";
  (sel && sel.water ? sel.water : []).forEach(function (wp) {
    marks += '<circle cx="' + X(wp.along).toFixed(1) + '" cy="' + (TOP - 6) + '" r="2.8" fill="#2563eb"/>';
  });
  (sel && sel.food ? sel.food : []).forEach(function (st) {
    marks += '<rect x="' + (X(st.along) - 2.4).toFixed(1) + '" y="' + (TOP - 13) + '" width="4.8" height="4.8" rx="1" fill="#ea580c"/>';
  });
  return '<svg width="100%" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="display:block">'
    + grid + ticks
    + '<path d="' + area + '" fill="#dbeafe"/>'
    + '<path d="' + line + '" fill="none" stroke="#2563eb" stroke-width="1.3"/>'
    + marks
    + '<text x="' + (w - 2) + '" y="' + (TOP - 5) + '" font-size="7.5" fill="#64748b" text-anchor="end">' + tot.toFixed(1) + ' km</text>'
    + '</svg>';
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
function rbkRows(sel) {
  var rows = [];
  (rbStops || []).forEach(function (s, i) {
    rows.push({ km: rbkStopKm(s), kind: "tappa", label: s.name || ("Tappa " + (i + 1)), extra: (s.type === "point" ? "waypoint" : "passo / salita") });
  });
  // paesi attraversati: danno un riferimento tra un passo e l'altro
  if (typeof routePlaces !== "undefined" && routePlaces) {
    routePlaces.forEach(function (p) {
      if (p.dist > 900) return;                         // troppo defilato per essere un riferimento
      rows.push({ km: p.along, kind: "luogo", label: p.name, extra: (p.place === "city" ? "citta'" : p.place === "town" ? "paese" : "frazione") + " · " + Math.round(p.dist) + " m" });
    });
  }
  (sel && sel.water ? sel.water : []).forEach(function (w) {
    rows.push({
      km: w.along, kind: "acqua", label: w.name || "Fontanella",
      extra: Math.round(w.dist) + " m dal percorso" + (w.pot === "Acqua potabile" ? "" : " · " + (w.pot || ""))
    });
  });
  (sel && sel.food ? sel.food : []).forEach(function (s) {
    var eta = rbkEta(s.along);
    rows.push({
      km: s.along, kind: "ristoro", label: s.name || s.kind,
      extra: s.kind + " · " + Math.round(s.dist) + " m",
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
    + '<div><span>Vento contrario</span><b>' + headKm.toFixed(0) + ' km</b></div>'
    + '<div><span>A favore</span><b>' + tailKm.toFixed(0) + ' km</b></div>'
    + '</div>';

  // avvisi, in ordine di sicurezza
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

  // tabella oraria con vento e sole
  h += '<table class="wx"><thead><tr><th>Km</th><th>Ora</th><th>Quota</th><th>Temp</th><th>Vento</th><th>Raff.</th><th>Sole</th><th>Pioggia</th><th>Cielo</th></tr></thead><tbody>';
  a.forEach(function (p) {
    var vento = "-";
    if (p.wind != null) {
      var lab = p.kind === "cross" ? "lat." : (p.kind === "head" ? "contro" : "favore");
      var val = p.kind === "cross" ? Math.round(p.cross) : Math.round(Math.abs(p.head));
      vento = val + " " + lab + "<div class='sub2'>da " + rbkCompass(p.dir) + "</div>";
    }
    var sole = "-";
    if (typeof ppSunAt === "function") {
      var s = ppSunAt(p.lat, p.lon, p.t, p.bearing);
      if (s) {
        sole = s.kind === "buio" ? "&#x1F311; buio"
          : s.kind === "basso" ? "&#x1F307; radente"
          : (s.kind === "faccia" ? "&#x2600;&#xFE0F; in faccia" : s.kind === "spalle" ? "&#x2600;&#xFE0F; di spalle" : "&#x2600;&#xFE0F; laterale");
        if (s.kind !== "buio") sole += "<div class='sub2'>" + Math.round(s.alt) + "&deg; sull'orizzonte</div>";
      }
    }
    h += '<tr><td class="km">' + p.km.toFixed(1) + '</td><td>' + rbkClock(p.t) + '</td>'
      + '<td>' + (p.ele != null ? Math.round(p.ele) + ' m' : '-') + '</td>'
      + '<td>' + (p.temp != null ? Math.round(p.temp) + '&deg;' : '-') + '</td>'
      + '<td class="' + (p.kind === "head" ? "bad" : p.kind === "tail" ? "good" : "") + '">' + vento + '</td>'
      + '<td>' + (p.gust != null ? Math.round(p.gust) : '-') + '</td>'
      + '<td>' + sole + '</td>'
      + '<td>' + (p.rain != null ? p.rain + '%' : '-') + (p.mm > 0.05 ? ' <small>' + p.mm.toFixed(1) + ' mm</small>' : '') + '</td>'
      + '<td>' + (typeof skyGlyph === "function" ? skyGlyph(p) : '') + '</td></tr>';
  });
  h += '</tbody></table>';
  h += '<div class="note">Vento e sole sono relativi alla <b>direzione di marcia</b>. I modelli meteo hanno maglie di 2-11 km e non colgono come il vento si incanala nelle valli: in quota prendili come indicazione. La posizione del sole e\' invece un calcolo astronomico esatto.</div>';
  return h;
}

/* ------------------------------ foglio completo ---------------------------- */
function buildRoadbookHTML(title) {
  var sel = (typeof selectPOIs === "function") ? selectPOIs() : { water: [], food: [], mode: "all" };
  var dist = trackDist(rbTrack), asc = trackAscent(rbTrack);
  var els = rbTrack.map(function (t) { return t[2]; }).filter(function (v) { return v != null; });
  var top = els.length ? Math.round(Math.max.apply(null, els)) : null;
  var name = title || (rbStops && rbStops.length ? rbStops.map(function (s) { return s.name; }).join(" · ") : "Il mio giro");
  var rows = rbkRows(sel);
  var today = new Date();
  var ds = ("0" + today.getDate()).slice(-2) + "/" + ("0" + (today.getMonth() + 1)).slice(-2) + "/" + today.getFullYear();

  // blocco partenza: cosa ha scelto l'utente
  var whenEl = document.getElementById("rw-when");
  var partenza = "";
  if (whenEl && whenEl.value) {
    var d0 = new Date(whenEl.value);
    if (!isNaN(d0.getTime())) {
      var giorni = ["domenica", "lunedi'", "martedi'", "mercoledi'", "giovedi'", "venerdi'", "sabato"];
      var mesi = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
      partenza = giorni[d0.getDay()] + " " + d0.getDate() + " " + mesi[d0.getMonth()] + " " + d0.getFullYear()
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
    else if (r.kind === "ristoro") tag = '<span class="unk">orario ignoto</span>';
    body += '<tr class="' + r.kind + '">'
      + '<td class="km">' + rbkNum(r.km) + '</td>'
      + '<td class="ic">' + ico[r.kind] + '</td>'
      + '<td><b>' + rbkEsc(r.label) + '</b><div class="sub">' + rbkEsc(r.extra || "") + '</div></td>'
      + '<td class="eta">' + (r.eta || "") + '</td>'
      + '<td class="tg">' + tag + '</td>'
      + '<td class="chk"></td></tr>';
  });

  // riquadro fabbisogno
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
  var conteggio = '<div class="note" style="margin-top:2px">Mostrati <b>' + (sel.water || []).length + '</b> punti acqua su ' + (sel.totalWater || 0)
    + ' e <b>' + (sel.food || []).length + '</b> ristori su ' + (sel.totalFood || 0) + ' trovati lungo il percorso.</div>';

  return '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Roadbook · ' + rbkEsc(name) + '</title><style>'
    + '@page{size:A4;margin:13mm}'
    + '*{box-sizing:border-box}'
    + 'body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;margin:0;padding:20px;font-size:11.5px;line-height:1.45}'
    + 'h1{font-size:20px;margin:0 0 2px;letter-spacing:-.2px}'
    + '.meta{color:#64748b;font-size:10.5px;margin-bottom:4px}'
    + '.dep{background:#eff6ff;border:1px solid #bfdbfe;border-radius:9px;padding:8px 11px;margin:8px 0;font-size:11px}'
    + '.sec{font-size:12.5px;font-weight:700;color:#1e3a8a;border-bottom:2px solid #bfdbfe;padding-bottom:4px;margin:18px 0 9px}'
    + '.cards{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}'
    + '.cards div{flex:1;min-width:86px;border:1px solid #e2e8f0;border-radius:9px;padding:7px 9px;background:#f8fafc}'
    + '.cards span{display:block;font-size:8.5px;letter-spacing:.4px;color:#64748b;text-transform:uppercase}'
    + '.cards b{font-size:14.5px}.cards.small b{font-size:13px}'
    + '.prof{border:1px solid #e2e8f0;border-radius:9px;overflow:hidden;margin:8px 0 4px;background:#fff}'
    + '.leg{display:flex;gap:14px;font-size:9px;color:#64748b;margin-bottom:10px}'
    + '.leg i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#2563eb;margin-right:4px}'
    + '.leg i.sq{border-radius:2px;background:#ea580c}'
    + 'table{width:100%;border-collapse:collapse;margin-top:4px}'
    + 'thead{display:table-header-group}'
    + 'th{text-align:left;font-size:8.5px;text-transform:uppercase;letter-spacing:.4px;color:#64748b;border-bottom:1.5px solid #cbd5e1;padding:5px 4px}'
    + 'td{border-bottom:1px solid #eef2f7;padding:5px 4px;vertical-align:top}'
    + 'tr{page-break-inside:avoid}'
    + '.km{width:42px;font-weight:700;color:#2563eb;white-space:nowrap}'
    + '.ic{width:18px}.eta{width:36px;font-weight:600}.tg{width:66px}'
    + '.chk{width:20px;border-left:1px solid #eef2f7}'
    + '.chk:after{content:"";display:block;width:11px;height:11px;border:1px solid #94a3b8;border-radius:3px;margin:1px auto}'
    + '.sub{color:#64748b;font-size:9.5px}.sub2{color:#94a3b8;font-size:8.5px}'
    + 'tr.tappa td{background:#f5f3ff}tr.tappa .km{color:#7c3aed}'
    + 'tr.luogo td{background:#fafafa}tr.luogo .km{color:#475569}tr.luogo b{font-weight:600;color:#475569}'
    + 'tr.acqua .km{color:#0284c7}'
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
    + '.foot{margin-top:16px;border-top:1px solid #e2e8f0;padding-top:6px;color:#94a3b8;font-size:8.5px;display:flex;justify-content:space-between}'
    + '.bar{background:#2563eb;color:#fff;padding:10px 14px;border-radius:10px;margin-bottom:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}'
    + '.bar button{font:inherit;font-weight:700;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;background:#fff;color:#1e3a5f}'
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
    + '<div><span>Punti in elenco</span><b>' + rows.length + '</b></div></div>'
    + '<div class="prof">' + rbkProfileSvg(720, 150, sel) + '</div>'
    + '<div class="leg"><span><i></i>acqua</span><span><i class="sq"></i>ristori</span><span>numeri sotto il profilo = chilometri</span></div>'
    + rbkWeatherBlocks()
    + '<div class="sec">&#x1F392; Fabbisogno stimato</div>' + fab
    + '<div class="sec">&#x1F5FA;&#xFE0F; Sequenza del giro</div>'
    + '<div class="note" style="margin:0 0 4px">' + selNote + '</div>' + conteggio
    + '<table><thead><tr><th>Km</th><th></th><th>Punto</th><th>Ora</th><th>Stato</th><th>&#x2713;</th></tr></thead>'
    + '<tbody>' + (body || '<tr><td colspan="6" style="color:#64748b">Nessun punto disponibile.</td></tr>') + '</tbody></table>'
    + '<div class="foot"><span>locaride.app &middot; ride like a local</span>'
    + '<span>Orari e potabilita\' da OpenStreetMap: verifica sul posto.</span></div>'
    + '</body></html>';
}

/* Apre il roadbook. Prima recupera i paesi attraversati (una sola richiesta,
   fatta solo qui: nel resto dell'app non serve). */
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

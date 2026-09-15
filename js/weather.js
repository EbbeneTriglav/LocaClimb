/* ============================================================================
 * weather.js - 7-day forecast, ranked for riding.
 * ----------------------------------------------------------------------------
 * Moved out of panel.js and reworked:
 *   - the recap is computed over a RIDING WINDOW (08-18), not the calendar day.
 *     "Max wind 45 km/h" that happens at 03:00 tells a cyclist nothing;
 *   - it ranks the whole week and shows the top 3, each with min/max temp,
 *     rain probability and amount, mean and max wind, and gusts when they bite;
 *   - Open-Meteo has no daily mean wind, so the hourly series is aggregated here.
 *
 * Exposes fetchW(lat, lon) - same entry point panel.js already calls. 100% ASCII.
 * ==========================================================================*/

var WRIDE_H0 = 8, WRIDE_H1 = 18;   // riding window, local time, inclusive
/* short Italian label per WMO weather code, for the "why this day" line */
var WCTXT = {
  0: "sereno", 1: "poco nuvoloso", 2: "variabile", 3: "coperto", 45: "nebbia", 48: "nebbia gelata",
  51: "pioviggine", 53: "pioviggine", 55: "pioviggine intensa", 61: "pioggia debole", 63: "pioggia",
  65: "pioggia forte", 71: "neve debole", 73: "neve", 75: "neve forte", 80: "rovesci", 81: "rovesci",
  82: "rovesci forti", 85: "rovesci di neve", 86: "rovesci di neve", 95: "temporali", 96: "temporali con grandine", 99: "temporali con grandine"
};

function fetchW(lat, lon) {
  var k = lat.toFixed(1) + "," + lon.toFixed(1);
  if (weatherCache[k]) { renderW(weatherCache[k]); return; }
  var u = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon
    + "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,windspeed_10m_max,windgusts_10m_max,weathercode"
    + "&hourly=temperature_2m,precipitation,precipitation_probability,windspeed_10m,windgusts_10m,weathercode"
    + "&timezone=auto&forecast_days=7";
  fetch(u).then(function (r) { return r.json(); })
    .then(function (d) { weatherCache[k] = d; renderW(d); })
    .catch(function () {
      var e = document.getElementById("wbox");
      if (e) e.innerHTML = "<p style='color:var(--err)'>Meteo non disponibile. Riprova tra poco.</p>";
    });
}

/* ---- aggregation ----------------------------------------------------------- */
/* one row per day, with calendar-day extremes AND riding-window statistics */
function wDays(data) {
  var d = data.daily, H = data.hourly || {}, byDay = {}, out = [];
  if (H.time) {
    for (var i = 0; i < H.time.length; i++) {
      var hh = parseInt(H.time[i].slice(11, 13), 10);
      if (hh < WRIDE_H0 || hh > WRIDE_H1) continue;
      var day = H.time[i].slice(0, 10);
      (byDay[day] = byDay[day] || []).push(i);
    }
  }
  for (var j = 0; j < d.time.length; j++) {
    var o = {
      date: d.time[j],
      tmin: d.temperature_2m_min[j], tmax: d.temperature_2m_max[j],
      code: d.weathercode[j],
      pprob: d.precipitation_probability_max[j] || 0,
      psum: (d.precipitation_sum && d.precipitation_sum[j]) || 0,
      wmax: d.windspeed_10m_max[j] || 0,
      gust: (d.windgusts_10m_max && d.windgusts_10m_max[j]) || 0,
      wmean: null, dayWorst: null
    };
    var ii = byDay[d.time[j]] || [];
    if (ii.length) {
      var sw = 0, pw = 0, mp = 0, mw = 0, mg = 0, worst = 0, n = 0, np = 0, nq = 0;
      for (var q = 0; q < ii.length; q++) {
        var k = ii[q];
        if (H.windspeed_10m && H.windspeed_10m[k] != null) { sw += H.windspeed_10m[k]; if (H.windspeed_10m[k] > mw) mw = H.windspeed_10m[k]; n++; }
        if (H.windgusts_10m && H.windgusts_10m[k] > mg) mg = H.windgusts_10m[k];
        if (H.precipitation && H.precipitation[k] != null) { pw += H.precipitation[k]; np++; }
        if (H.precipitation_probability && H.precipitation_probability[k] != null) { nq++; if (H.precipitation_probability[k] > mp) mp = H.precipitation_probability[k]; }
        if (H.weather_code || H.weathercode) { var wc = (H.weathercode || H.weather_code)[k] || 0; if (wSeverity(wc) > wSeverity(worst)) worst = wc; }
      }
      if (n) { o.wmean = sw / n; o.wmax = mw; }
      if (mg) o.gust = mg;
      if (np) o.psum = Math.round(pw * 10) / 10;
      if (nq) o.pprob = mp;
      if (H.weathercode || H.weather_code) o.dayWorst = worst;
    }
    if (o.wmean == null) o.wmean = o.wmax * 0.6;      // no hourly series: rough stand-in
    /* icon + verdict follow the riding window: a 3 a.m. thunderstorm should not
       brand a clear afternoon as stormy */
    o.icode = (o.dayWorst != null) ? o.dayWorst : o.code;
    o.score = wScore(o);
    out.push(o);
  }
  return out;
}
function wSeverity(c) {
  if (c >= 95) return 5;
  if (c >= 80 || (c >= 61 && c <= 75)) return 4;
  if (c >= 51) return 3;
  if (c >= 45) return 2;
  return c >= 3 ? 1 : 0;
}

/* 0-100 riding index: rain first, then wind, then temperature, then weekend traffic */
function wScore(o) {
  var s = 100;
  s -= o.pprob * 0.55;
  s -= Math.min(30, o.psum * 7);
  if (o.wmean > 16) s -= (o.wmean - 16) * 1.8;
  if (o.gust > 45) s -= (o.gust - 45) * 1.1;
  if (o.tmax < 8) s -= (8 - o.tmax) * 3;
  else if (o.tmax > 30) s -= (o.tmax - 30) * 3.5;
  if (o.tmin < 0) s -= 6;
  var sev = wSeverity(o.dayWorst != null ? o.dayWorst : o.code);
  if (sev >= 5) s -= 20; else if (sev === 4) s -= 10;
  return Math.max(0, Math.min(100, Math.round(s)));
}

/* one short line explaining the ranking, built from what actually drove it */
function wWhy(o) {
  var t = [], sev = wSeverity(o.icode);
  if (sev >= 5) t.push("temporali");
  else if (o.icode >= 71 && o.icode <= 75) t.push("neve");
  if (o.pprob < 15 && o.psum < 0.2) t.push("asciutto");
  else if (o.psum >= 2) t.push("pioggia probabile");
  else if (o.pprob >= 40) t.push("rovesci possibili");
  if (o.wmean < 10) t.push("vento debole");
  else if (o.gust >= 50) t.push("raffiche forti");
  else if (o.wmean >= 22) t.push("ventoso");
  if (o.tmax >= 10 && o.tmax <= 26 && o.tmin >= 2) t.push("temperature ideali");
  else if (o.tmin < 0) t.push("gelo all'alba");
  else if (o.tmax > 30) t.push("caldo intenso");
  var dow = new Date(o.date + "T12:00:00").getDay();
  if ((dow === 0 || dow === 6) && t.length < 3) t.push("weekend: pi&#xF9; auto");
  if (!t.length) t.push(WCTXT[o.icode] || "condizioni nella media");
  return t.slice(0, 3).join(", ");
}

/* ---- formatting ------------------------------------------------------------ */
function wNum(x, dec) { return (Math.round(x * Math.pow(10, dec)) / Math.pow(10, dec)).toFixed(dec).replace(".", ","); }
function wMm(x) { return x < 0.1 ? "0 mm" : (x < 10 ? wNum(x, 1) : Math.round(x)) + " mm"; }
function wDayLabel(iso) {
  var dt = new Date(iso + "T12:00:00"), t = new Date(), s;
  var same = dt.toDateString() === t.toDateString();
  var tom = new Date(t.getTime() + 864e5).toDateString() === dt.toDateString();
  if (same) s = "Oggi"; else if (tom) s = "Domani";
  else s = dt.toLocaleDateString("it-IT", { weekday: "long", day: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---- render ---------------------------------------------------------------- */
function renderW(data) {
  var el = document.getElementById("wbox");
  if (!el || !data.daily) return;
  var days = wDays(data), h = "";

  var maxW = 0, maxG = 0;
  days.forEach(function (o) { if (o.wmax > maxW) maxW = o.wmax; if (o.gust > maxG) maxG = o.gust; });
  if (maxG > 60 || maxW > 60) h += '<div class="alert-wind eb">&#x1F534; <b>Attenzione:</b> raffiche fino a ' + Math.round(Math.max(maxG, maxW)) + ' km/h in settimana</div>';
  else if (maxW > 40) h += '<div class="alert-wind wb">&#x26A0;&#xFE0F; <b>Vento forte:</b> fino a ' + Math.round(maxW) + ' km/h in settimana</div>';

  /* top 3 */
  /* ordine puramente meteo; il weekend pesa solo a parita' di punteggio, cosi' una
     giornata migliore non viene mai declassata per il traffico */
  var wknd = function (o) { var d = new Date(o.date + "T12:00:00").getDay(); return (d === 0 || d === 6) ? 1 : 0; };
  var rank = days.slice().sort(function (a, b) { return b.score - a.score || wknd(a) - wknd(b) || a.date.localeCompare(b.date); }).slice(0, 3);
  var pos = {}; rank.forEach(function (o, i) { pos[o.date] = i + 1; });

  h += '<div class="wpodium">';
  rank.forEach(function (o, i) {
    h += '<div class="wpod r' + (i + 1) + '">';
    h += '<div class="wpod-top"><span class="wpod-rk">' + (i + 1) + '</span><span class="wpod-day">' + wDayLabel(o.date) + '</span><span class="wpod-ico">' + we(o.icode) + '</span></div>';
    h += '<div class="wpod-mets">';
    h += '<div><span>Min / Max</span><b>' + Math.round(o.tmin) + '&#xB0; / ' + Math.round(o.tmax) + '&#xB0;</b></div>';
    h += '<div><span>Pioggia</span><b>' + Math.round(o.pprob) + '% &middot; ' + wMm(o.psum) + '</b></div>';
    h += '<div><span>Vento med / max</span><b>' + Math.round(o.wmean) + ' / ' + Math.round(o.wmax) + ' km/h</b></div>';
    if (o.gust >= 40) h += '<div><span>Raffiche</span><b class="wpod-warn">' + Math.round(o.gust) + ' km/h</b></div>';
    h += '</div>';
    h += '<div class="wpod-why">' + wWhy(o) + '</div>';
    h += '</div>';
  });
  h += '</div>';
  h += '<p class="wnote">Valori nella fascia ' + WRIDE_H0 + '-' + WRIDE_H1 + ', quando si pedala. Minime e massime sono dell\'intera giornata.</p>';

  /* week strip */
  h += '<div class="wgrid">';
  days.forEach(function (o) {
    var dt = new Date(o.date + "T12:00:00"), r = pos[o.date];
    h += '<div class="wcard' + (r ? ' rk r' + r : '') + '">';
    if (r) h += '<div class="wcard-rk">' + r + '</div>';
    h += '<div class="wcard-d">' + DAYS[dt.getDay()] + ' ' + dt.getDate() + '</div>';
    h += '<div style="font-size:1.5em;margin:3px 0">' + we(o.icode) + '</div>';
    h += '<div style="font-weight:700">' + Math.round(o.tmax) + '&#xB0;</div>';
    h += '<div style="font-size:.75em;opacity:.6">' + Math.round(o.tmin) + '&#xB0;</div>';
    h += '<div style="font-size:.7em;margin-top:2px">&#x1F4A7;' + Math.round(o.pprob) + '%</div>';
    h += '<div style="font-size:.7em">&#x1F4A8;' + Math.round(o.wmax) + '</div>';
    h += '</div>';
  });
  h += '</div>';

  el.innerHTML = h;
}

/* ============================================================================
 * sunexposure.js - terrain-aware sun exposure, averaged over the WHOLE climb.
 * ----------------------------------------------------------------------------
 * Replaces calcSun() (utils.js), which had four problems:
 *   1. single point  - it used the SUMMIT coordinates for the whole versante;
 *   2. single aspect - one cardinal label (v.exposure) with a hard +/-45 deg
 *                      azimuth window. A road at 8% is ~4.6 deg of tilt: at that
 *                      angle the sun lights the slope over ~180 deg of azimuth,
 *                      not 90. The window was both too narrow and the wrong shape;
 *   3. no terrain    - the real driver of shade on an alpine climb is the ridge
 *                      on the other side of the valley, never the road's own tilt;
 *   4. 1-hour steps  - "9:00-17:00" quantisation, +/-30 min of error at both ends.
 *
 * Model here, per sampled point along the track:
 *   sunlit(t) = sunAltitude(t) > horizonAngle(sunAzimuth(t))      (terrain)
 *               AND cos(incidence on the local slope plane) > 0   (self-shading)
 * evaluated every 10 minutes. The climb's value is the MEAN over its points, so
 * "6.4 h" means the average point on the road sees 6.4 hours of direct sun, and
 * the hourly strip shows WHICH PART of the climb is lit at each hour.
 *
 * Horizon + local aspect/slope come from data/sun_horizon.json, baked offline by
 * scripts/build_sun_horizon.mjs off the same Terrarium DEM as the rest of the
 * pipeline. With no baked data the module degrades to a flat-horizon estimate
 * (still physically correct for the slope term) and labels itself as such - it
 * never silently passes off a terrain-free number as a terrain-aware one.
 *
 * Depends on: SunCalc, DATA_DIR (state.js). 100% ASCII.
 * ==========================================================================*/

var SUNX = {
  data: null,          // parsed sun_horizon.json
  pending: null,       // in-flight load promise
  cache: {},           // "passId|side" -> point profile
  STEP: 10,            // minutes between samples
  H0: 2, H1: 23,       // hours covered by the strip (largo per le estati nordiche)
  MINALT: 1.0,         // deg - below this the sun is too low/red to count
  deg: null            // SunCalc unit convention, probed on first use
};

/* SunCalc 1.x returns radians with azimuth measured from SOUTH; 2.x returns
   degrees measured from NORTH. Probe once so an SDK bump can't silently skew
   every sun time by 180 deg. Reference: 21 Jun 12:00 UTC at 0N/0E -> alt ~66 deg
   (~1.16 rad), so any value above 3 can only be degrees. */
function sunUnits() {
  if (SUNX.deg == null) {
    var p = SunCalc.getPosition(new Date(Date.UTC(2000, 5, 21, 12, 0, 0)), 0, 0);
    SUNX.deg = Math.abs(p.altitude) > 3;
  }
  return SUNX.deg;
}
function sunPos(dt, lat, lon) {
  var p = SunCalc.getPosition(dt, lat, lon);
  if (sunUnits()) return { alt: p.altitude, az: ((p.azimuth % 360) + 360) % 360 };
  return { alt: p.altitude * 180 / Math.PI, az: (p.azimuth * 180 / Math.PI + 180) % 360 };
}

/* ---- geometry helpers (self-contained: utils.js compass() returns Italian) - */
function sunBearing(la1, lo1, la2, lo2) {
  var p = Math.PI / 180;
  var y = Math.sin((lo2 - lo1) * p) * Math.cos(la2 * p);
  var x = Math.cos(la1 * p) * Math.sin(la2 * p) - Math.sin(la1 * p) * Math.cos(la2 * p) * Math.cos((lo2 - lo1) * p);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
/* linear interpolation across the stored azimuth sectors */
function sunHorizonAt(hz, az) {
  if (!hz || !hz.length) return 0;
  var n = hz.length, x = ((az % 360) + 360) % 360 / (360 / n);
  var i = Math.floor(x), f = x - i;
  var a = hz[i % n], b = hz[(i + 1) % n];
  return a + (b - a) * f;
}
/* is this point lit, with the sun at (alt, az) in degrees? */
function sunPointLit(pt, alt, az) {
  if (alt <= sunHorizonAt(pt.hz, az)) return false;          // blocked by terrain
  if (pt.slp < 2) return true;                               // effectively flat
  var b = pt.slp * Math.PI / 180, h = alt * Math.PI / 180, d = (az - pt.asp) * Math.PI / 180;
  return (Math.cos(b) * Math.sin(h) + Math.sin(b) * Math.cos(h) * Math.cos(d)) > 0;
}

/* ---- baked horizon data --------------------------------------------------- */
function sunLoadHorizon() {
  if (SUNX.data) return Promise.resolve(SUNX.data);
  if (SUNX.pending) return SUNX.pending;
  SUNX.pending = fetch(DATA_DIR + "sun_horizon.json", { cache: "force-cache" })
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (o) { SUNX.data = o || {}; return SUNX.data; })
    .catch(function () { SUNX.data = { p: {} }; return SUNX.data; });   // absent file = flat fallback
  return SUNX.pending;
}

/* Sample points for a versante. Baked entry wins; otherwise build a flat-horizon
   profile from the track itself (aspect = summit -> point, slope = road grade). */
function sunProfile(p, v) {
  var key = p.id + "|" + (v.side || "");
  if (SUNX.cache[key]) return SUNX.cache[key];
  var baked = SUNX.data && SUNX.data.p && SUNX.data.p[key];
  var prof;
  if (baked && baked.length) {
    prof = { src: "dem", pts: baked.map(function (o) { return { lat: o[0], lon: o[1], hz: o[2], asp: o[3], slp: o[4] }; }) };
  } else {
    prof = { src: "flat", pts: sunFlatPoints(v) };
  }
  SUNX.cache[key] = prof;
  return prof;
}
function sunFlatPoints(v) {
  var tr = v.track || [];
  if (tr.length < 2) return [];
  var n = Math.min(9, tr.length), top = tr[tr.length - 1], out = [];
  var zero = []; for (var z = 0; z < 16; z++) zero.push(0);
  var slp = Math.atan(Math.abs(v.avgGradient || 6) / 100) * 180 / Math.PI;
  for (var i = 0; i < n; i++) {
    var c = tr[Math.round(i * (tr.length - 1) / (n - 1))];
    // the slope a point sits on faces away from the summit
    var asp = (i === n - 1 && out.length) ? out[out.length - 1].asp : sunBearing(top[0], top[1], c[0], c[1]);
    out.push({ lat: c[0], lon: c[1], hz: zero, asp: asp, slp: slp });
  }
  return out;
}

/* ---- the actual calculation ----------------------------------------------- */
/* -> {hours, first, last, curve:[{h,f}], src, n} for one versante on one date.
   hours = mean sun hours per point; curve[h].f = share of the climb lit at hour h. */
function sunStats(p, v, date) {
  var prof = sunProfile(p, v), pts = prof.pts;
  if (!pts.length || typeof SunCalc === "undefined") return null;
  var Y = date.getFullYear(), M = date.getMonth(), D = date.getDate();
  var hours = 0, first = null, last = null, bucket = {}, n = pts.length;
  var rlat = pts[Math.floor(n / 2)].lat, rlon = pts[Math.floor(n / 2)].lon;
  for (var m = SUNX.H0 * 60; m <= SUNX.H1 * 60; m += SUNX.STEP) {
    var dt = new Date(Y, M, D, 0, m, 0);
    var sp = sunPos(dt, rlat, rlon), f = 0;
    if (sp.alt > SUNX.MINALT) {
      var lit = 0;
      for (var i = 0; i < n; i++) if (sunPointLit(pts[i], sp.alt, sp.az)) lit++;
      f = lit / n;
    }
    hours += f * SUNX.STEP / 60;
    if (f >= 0.5) { if (!first) first = dt; last = dt; }
    var hh = Math.floor(m / 60);
    if (!bucket[hh]) bucket[hh] = { s: 0, c: 0 };
    bucket[hh].s += f; bucket[hh].c++;
  }
  /* la striscia copre solo le ore che contano: dalla prima all'ultima con un po' di
     luce, piu' un'ora di margine. Venti barrette di cui meta' vuote non dicono nulla. */
  var all = [], lo = null, hi = null;
  for (var h = SUNX.H0; h <= SUNX.H1; h++) {
    if (!bucket[h]) continue;
    var fv = bucket[h].s / bucket[h].c;
    all.push({ h: h, f: fv });
    if (fv > 0.02) { if (lo === null) lo = h; hi = h; }
  }
  if (lo === null) { lo = 8; hi = 18; }
  var curve = all.filter(function (o) { return o.h >= lo - 1 && o.h <= hi + 1; });
  return { hours: Math.round(hours * 10) / 10, first: first, last: last, curve: curve, src: prof.src, n: n };
}

/* ---- rendering ------------------------------------------------------------ */
function sunHM(d) { return d ? (d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes()) : "--"; }
function sunCellStub(i) { return '<div class="sunx" id="sunx-' + i + '"><span class="sunx-wait">&#8230;</span></div>'; }

/* Without a baked horizon the number is an UPPER BOUND, not a measurement: terrain
   can only take hours away. Say so with "<=" rather than dressing it up as a value. */
function sunCellHTML(s) {
  if (!s) return '<span class="sunx-na">n/d</span>';
  if (s.hours < 0.2) return '<div class="sunx-h">&#x1F311; In ombra</div><div class="sunx-sub">tutto il giorno</div>';
  var est = s.src === "flat";
  var h = '<div class="sunx-h">' + (est ? '&#8804; ' : '') + String(s.hours).replace(".", ",") + ' h</div>';
  h += '<div class="sunx-strip' + (est ? ' est' : '') + '" title="Quota della salita al sole, ora per ora">';
  for (var i = 0; i < s.curve.length; i++) {
    var c = s.curve[i], pct = Math.round(c.f * 100);
    h += '<i style="' + (pct ? 'background:#f59e0b;opacity:' + (0.15 + 0.85 * c.f).toFixed(2) : 'background:var(--bdr)') + '" title="' + c.h + ':00 &middot; ' + pct + '% al sole"></i>';
  }
  h += '</div>';
  h += '<div class="sunx-sub">' + (est ? 'senza ombre dei rilievi' : (s.first ? sunHM(s.first) + ' &rarr; ' + sunHM(s.last) : 'solo sole radente')) + '</div>';
  return h;
}

/* Fill the Sole row of the comparison table. Called after the panel is in the DOM. */
function renderSunCells(p) {
  if (!p || !p.versanti || !p.versanti.length) return;
  sunLoadHorizon().then(function () {
    var today = new Date();
    p.versanti.forEach(function (v, i) {
      var el = document.getElementById("sunx-" + i);
      if (!el) return;
      var s = sunStats(p, v, today);
      el.innerHTML = sunCellHTML(s);
      if (s) el.title = "Media su " + s.n + " punti del tracciato" + (s.src === "dem" ? ", ombre del terreno incluse" : ", senza ombre del terreno");
    });
  });
}

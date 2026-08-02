/* ===========================================================================
   LocaRide - Statistiche e badge
   ---------------------------------------------------------------------------
   Terza scheda del profilo: totali (km, dislivello), passi conquistati,
   record personali e badge con barra di avanzamento verso il livello dopo.

   COSA CONTA DAVVERO (trasparenza verso l'utente)
   I numeri vengono dai giri SALVATI nel profilo, non da attivita' registrate
   con un GPS: sono i tuoi percorsi pianificati o importati. Nell'interfaccia
   e' scritto chiaramente, per non far credere che sia un diario di allenamento.

   COME E' AGGANCIATO
   Come reviews.js e share.js: caricato DOPO gli altri, ridefinisce mrHeader()
   per aggiungere la terza scheda. Togliendo il tag <script> sparisce tutto.
   =========================================================================== */

var myStats = null;

/* ---------------------------- intestazione a 3 schede ---------------------- */
function mrHeader() {
  var who = (typeof FBUSER !== "undefined" && FBUSER) ? (FBUSER.displayName || FBUSER.email || "") : "";
  var tab = function (id, label, act) {
    var on = mrTab === id;
    return '<button data-act="' + act + '" style="border:none;cursor:pointer;font:inherit;font-weight:600;font-size:.8rem;padding:6px 12px;border-radius:999px;'
      + (on ? 'background:#fff;color:#1e3a5f' : 'background:rgba(255,255,255,.18);color:#fff') + '">' + label + '</button>';
  };
  return '<div class="dp-hdr"><div style="display:flex;justify-content:space-between;align-items:start"><div>'
    + '<h2 style="margin:0;font-size:1.3em">&#x1F464; Il mio profilo</h2>'
    + '<p style="margin:3px 0;opacity:.9">' + esc(who) + '</p>'
    + '</div><button data-act="closeD" style="background:rgba(255,255,255,.2);border:none;color:#fff;font-size:1.3em;cursor:pointer;border-radius:8px;padding:4px 10px">&#x2715;</button></div>'
    + '<div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap">'
    + tab("rides", "&#x1F6B5; Giri", "openMyRides")
    + tab("reviews", "&#x2B50; Recensioni", "openMyReviews")
    + tab("stats", "&#x1F4CA; Statistiche", "openMyStats")
    + '</div></div>';
}

/* ------------------------------- calcolo dati ------------------------------ */

/* Quota massima da una traccia serializzata, senza ricostruirla tutta:
   scorriamo i segmenti e leggiamo solo il terzo campo. */
function maxEleFromTrackStr(s) {
  if (!s) return null;
  var parts = s.split(";"), mx = null;
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i], c2 = p.lastIndexOf(",");
    if (c2 < 0) continue;
    var e = p.slice(c2 + 1);
    if (!e) continue;
    var v = +e;
    if (!isNaN(v) && (mx == null || v > mx)) mx = v;
  }
  return mx;
}
/* Normalizza il nome di un passo per non contare due volte "Passo Gavia" e "passo gavia". */
function passKey(n) {
  return String(n || "").toLowerCase().replace(/^(passo|colle|col|monte|cima|forcella)\s+/, "").replace(/[^a-z0-9]+/g, "").trim();
}

function computeStats(rides, reviews) {
  var st = {
    n: rides.length, km: 0, asc: 0, maxEle: null,
    longest: null, hardest: null, highest: null,
    passes: {}, nReviews: reviews.length, firstDate: null, lastDate: null
  };
  rides.forEach(function (r) {
    st.km += (r.distKm || 0);
    st.asc += (r.ascent || 0);
    if (!st.longest || (r.distKm || 0) > (st.longest.distKm || 0)) st.longest = r;
    if (!st.hardest || (r.ascent || 0) > (st.hardest.ascent || 0)) st.hardest = r;
    var me = maxEleFromTrackStr(r.track);
    if (me != null) {
      if (st.maxEle == null || me > st.maxEle) { st.maxEle = me; st.highest = r; }
    }
    (r.stops || []).forEach(function (s) {
      if (s.type === "pass" && s.name) { var k = passKey(s.name); if (k) st.passes[k] = s.name; }
    });
    if (r.savedAt) {
      if (!st.firstDate || r.savedAt < st.firstDate) st.firstDate = r.savedAt;
      if (!st.lastDate || r.savedAt > st.lastDate) st.lastDate = r.savedAt;
    }
  });
  // i passi recensiti contano come "conosciuti" anche se non salvati in un giro
  reviews.forEach(function (v) { if (v.passName) { var k = passKey(v.passName); if (k) st.passes[k] = v.passName; } });
  st.nPasses = Object.keys(st.passes).length;
  return st;
}

/* --------------------------------- badge ----------------------------------- */
/* Soglie scelte per essere raggiungibili ma non banali. Il livello successivo
   e' sempre visibile con la barra: e' quello che fa tornare. */
var BADGES = [
  { g: "Distanza", u: "km", icon: "&#x1F6B4;", key: "km", lv: [
      { v: 100, n: "Primi 100" }, { v: 500, n: "Mezzo migliaio" }, { v: 1000, n: "Millesimo" },
      { v: 2500, n: "Gran Fondista" }, { v: 5000, n: "Macinatore" }] },
  { g: "Dislivello", u: "m", icon: "&#x26F0;&#xFE0F;", key: "asc", lv: [
      { v: 5000, n: "Prime rampe" }, { v: 15000, n: "Scalatore" }, { v: 30000, n: "Grimpeur" },
      { v: 60000, n: "Capra" }, { v: 100000, n: "Centomila" }] },
  { g: "Passi diversi", u: "", icon: "&#x1F3D4;&#xFE0F;", key: "nPasses", lv: [
      { v: 1, n: "Battesimo" }, { v: 5, n: "Collezionista" }, { v: 10, n: "Cacciatore di passi" },
      { v: 25, n: "Esploratore" }, { v: 50, n: "Enciclopedia" }] },
  { g: "Quota massima", u: "m", icon: "&#x1F9CA;", key: "maxEle", lv: [
      { v: 1500, n: "Sopra i boschi" }, { v: 2000, n: "Duemila" }, { v: 2500, n: "Aria fina" },
      { v: 2758, n: "Quota Stelvio" }, { v: 3000, n: "Tremila" }] }
];

function badgeBlock(b, val) {
  val = val || 0;
  var earned = b.lv.filter(function (l) { return val >= l.v; });
  var next = b.lv.filter(function (l) { return val < l.v; })[0];
  var cur = earned.length ? earned[earned.length - 1] : null;
  var prevV = cur ? cur.v : 0;
  var pct = next ? Math.max(0, Math.min(100, ((val - prevV) / (next.v - prevV)) * 100)) : 100;
  var fmt = function (v) { return b.u === "km" ? v.toLocaleString("it-IT") + " km" : (b.u === "m" ? v.toLocaleString("it-IT") + " m" : String(v)); };

  var h = '<div style="border:1px solid var(--bdr);border-radius:12px;padding:12px 14px;margin:9px 0;background:var(--bg)">'
    + '<div style="display:flex;align-items:center;gap:9px;margin-bottom:6px">'
    + '<span style="font-size:1.3rem">' + b.icon + '</span>'
    + '<div><div style="font-weight:700">' + b.g + '</div>'
    + '<div style="font-size:.78rem;color:var(--txt2)">' + fmt(Math.round(val)) + (cur ? ' &middot; <b style="color:var(--ok)">' + cur.n + '</b>' : '') + '</div></div></div>';
  // pallini dei livelli
  h += '<div style="display:flex;gap:5px;flex-wrap:wrap;margin:6px 0">';
  b.lv.forEach(function (l) {
    var got = val >= l.v;
    h += '<span title="' + esc(l.n + " · " + fmt(l.v)) + '" style="font-size:.68rem;padding:2px 8px;border-radius:20px;'
      + (got ? 'background:#dcfce7;color:#166534;font-weight:700' : 'background:var(--bdr);color:var(--txt2)') + '">'
      + (got ? '&#x2713; ' : '') + esc(l.n) + '</span>';
  });
  h += '</div>';
  if (next) {
    h += '<div style="height:7px;background:var(--bdr);border-radius:5px;overflow:hidden;margin-top:6px">'
      + '<div style="height:100%;width:' + pct.toFixed(0) + '%;background:linear-gradient(90deg,#2563eb,#7c3aed)"></div></div>'
      + '<div style="font-size:.72rem;color:var(--txt2);margin-top:4px">Mancano <b>' + fmt(Math.round(next.v - val)) + '</b> per &laquo;' + esc(next.n) + '&raquo;</div>';
  } else {
    h += '<div style="font-size:.72rem;color:var(--ok);font-weight:700;margin-top:4px">Tutti i livelli raggiunti &#x1F3C6;</div>';
  }
  return h + '</div>';
}

/* --------------------------------- pagina ---------------------------------- */
function openMyStats() {
  if (!window.FB || !FBUSER) { if (typeof acctOpen === "function") acctOpen(); return; }
  mrTab = "stats";
  var dp = document.getElementById("dp"); if (!dp) return;
  dp.innerHTML = mrHeader() + '<div class="dp-body"><p style="color:var(--txt2)">Calcolo le tue statistiche&#8230;</p></div>';
  setPanel("dp", true);

  var base = FB.db.collection("users").doc(FBUSER.uid);
  Promise.all([
    base.collection("routes").limit(300).get(),
    base.collection("reviews").limit(300).get()
  ]).then(function (res) {
    var rides = [], revs = [];
    res[0].forEach(function (d) { rides.push(d.data()); });
    res[1].forEach(function (d) { revs.push(d.data()); });
    myStats = computeStats(rides, revs);
    renderMyStats();
  }).catch(function (e) {
    dp.innerHTML = mrHeader() + '<div class="dp-body"><p style="color:var(--err)">Impossibile calcolare: ' + esc(e.message || String(e)) + '</p></div>';
  });
}

function renderMyStats() {
  var dp = document.getElementById("dp"); if (!dp || !myStats) return;
  var s = myStats;
  var h = mrHeader() + '<div class="dp-body">';

  if (!s.n) {
    h += '<p style="color:var(--txt2)">Nessun giro salvato: le statistiche compaiono appena salvi il primo percorso.</p></div>';
    dp.innerHTML = h; return;
  }

  h += '<div class="rstats">'
    + '<div>Giri salvati<b>' + s.n + '</b></div>'
    + '<div>Distanza<b>' + s.km.toFixed(0) + ' km</b></div>'
    + '<div>Dislivello<b>' + s.asc.toLocaleString("it-IT") + ' m</b></div>'
    + '<div>Passi<b>' + s.nPasses + '</b></div></div>';

  // paragone comprensibile: il dislivello totale in "Everest"
  if (s.asc > 800) {
    var ev = s.asc / 8848;
    h += '<div style="font-size:.82rem;color:var(--txt2);margin:2px 0 6px">&#x26F0;&#xFE0F; In totale hai salito <b>' + ev.toFixed(2) + '</b> volte l\'altezza dell\'Everest (8.848 m).</div>';
  }

  h += '<div class="section-title">&#x1F3C5; Badge</div>';
  BADGES.forEach(function (b) { h += badgeBlock(b, s[b.key]); });

  h += '<div class="section-title">&#x1F4C8; Record personali</div>';
  var rec = function (lab, r, val) {
    if (!r) return '';
    return '<div class="rstop"><span style="flex:1"><b>' + esc(r.name || "Giro") + '</b><div style="font-size:.76rem;color:var(--txt2)">' + lab + '</div></span><span style="font-weight:700;color:var(--ac)">' + val + '</span></div>';
  };
  h += rec("Giro piu' lungo", s.longest, (s.longest ? s.longest.distKm.toFixed(1) : 0) + ' km');
  h += rec("Piu' dislivello", s.hardest, (s.hardest ? s.hardest.ascent : 0) + ' m');
  if (s.highest && s.maxEle != null) h += rec("Quota piu' alta toccata", s.highest, Math.round(s.maxEle) + ' m');

  if (s.nPasses) {
    h += '<div class="section-title">&#x1F3D4;&#xFE0F; Passi conquistati (' + s.nPasses + ')</div><div style="display:flex;flex-wrap:wrap;gap:6px">';
    Object.keys(s.passes).sort(function (a, b) { return s.passes[a].localeCompare(s.passes[b]); }).forEach(function (k) {
      h += '<span style="font-size:.76rem;background:var(--bg);border:1px solid var(--bdr);border-radius:20px;padding:3px 10px">' + esc(s.passes[k]) + '</span>';
    });
    h += '</div>';
  }

  if (s.nReviews) h += '<div style="font-size:.8rem;color:var(--txt2);margin-top:12px">&#x2B50; Hai scritto <b>' + s.nReviews + '</b> recension' + (s.nReviews === 1 ? 'e' : 'i') + '.</div>';

  h += '<div style="font-size:.72rem;color:var(--txt2);margin-top:14px;line-height:1.45">'
    + 'I numeri derivano dai <b>giri salvati nel tuo profilo</b> (pianificati o importati), non da attivita\' registrate con un GPS. '
    + 'Se elimini un giro, i totali si aggiornano di conseguenza.</div>';

  h += '</div>';
  dp.innerHTML = h;
}

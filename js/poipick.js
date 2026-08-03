/* ===========================================================================
   LocaRide - selezione dei punti utili, fabbisogno stimato, posizione del sole
   ---------------------------------------------------------------------------
   PERCHE' NON SI FILTRA "A CALORIE"
   Le calorie stimate da distanza e dislivello hanno un margine del +/-30% (dipendono
   da peso, potenza, posizione, vento) e soprattutto NON sono cio' che decide una
   sosta: un ciclista si ferma quando finisce l'acqua o quando e' passato troppo
   tempo, non quando ha bruciato 800 kcal.
   Qui si seleziona quindi per TEMPO, con l'intervallo dell'acqua legato alla
   TEMPERATURA PREVISTA lungo il percorso - un dato che abbiamo gia' e che governa
   davvero quanto spesso devi riempire le borracce.
   Calorie e litri restano, ma come INFORMAZIONE per preparare le tasche.

   Modalita': tutti | essenziali | solo acqua | nessuno
   =========================================================================== */

/* ------------------------------- impostazioni ------------------------------ */
var PP_MASS = 80;        // kg: ciclista + bici + borse, valore medio dichiarato
var PP_CRR = 0.005;      // resistenza al rotolamento su asfalto
var PP_CDA = 0.35;       // area frontale efficace, posizione sulle maniglie
var PP_EFF = 0.23;       // efficienza metabolica: ~23% dell'energia diventa lavoro

function ppMode() {
  var el = document.getElementById("poi-mode");
  return (el && el.value) ? el.value : "essential";
}
function ppPace() {
  var el = document.getElementById("rw-speed");
  var v = el ? parseInt(el.value, 10) : 22;
  return (isNaN(v) || v < 8) ? 22 : v;
}

/* --------------------------- temperatura e tempi --------------------------- */
/* Temperatura media prevista sul percorso; se il meteo non e' stato calcolato
   torna null e si usano gli intervalli "clima mite". */
function ppAvgTemp() {
  if (typeof rwData === "undefined" || !rwData || !rwData.length) return null;
  var s = 0, n = 0;
  rwData.forEach(function (p) { if (p.temp != null) { s += p.temp; n++; } });
  return n ? s / n : null;
}
/* Intervallo tra due rifornimenti d'acqua, in minuti.
   Due borracce (1,5 l) durano circa: 2 h sotto i 15 gradi, 1,5 h fino a 22,
   1 h fino a 28, 45 min oltre. Sono i valori pratici che usano i ciclisti. */
function ppWaterInterval() {
  var t = ppAvgTemp();
  if (t == null) return 90;
  if (t >= 28) return 45;
  if (t >= 22) return 60;
  if (t >= 15) return 90;
  return 120;
}
function ppFoodInterval() { return 90; }   // mangiare ogni ora e mezza: regola pratica

/* Orario stimato di passaggio a un dato km. Con il meteo calcolato usa la tabella
   oraria vera; altrimenti stima dall'andatura dichiarata. */
function ppTimeAtKm(km) {
  if (typeof rwData !== "undefined" && rwData && rwData.length > 1 && typeof rwEtaAt === "function") {
    var t = rwEtaAt(km);
    if (t) return (t - rwData[0].t) / 60000;          // minuti dalla partenza
  }
  return (km / ppPace()) * 60;
}
function ppTotalMinutes() {
  var d = (typeof rbTrack !== "undefined" && rbTrack && rbTrack.length > 1) ? trackDist(rbTrack) : 0;
  return ppTimeAtKm(d);
}

/* ---------------------- fabbisogno stimato (informativo) ------------------- */
/* Modello fisico dichiarato: lavoro contro gravita' + rotolamento + aria, diviso
   per l'efficienza metabolica. Resta una stima: serve a decidere quante barrette
   mettere in tasca, non a programmare le soste. */
function ppEnergy() {
  if (typeof rbTrack === "undefined" || !rbTrack || rbTrack.length < 2) return null;
  var dist = trackDist(rbTrack) * 1000, asc = trackAscent(rbTrack);
  var v = ppPace() / 3.6, g = 9.81, rho = 1.2;
  var wGrav = PP_MASS * g * asc;
  var wRoll = PP_CRR * PP_MASS * g * dist;
  var wAir = 0.5 * rho * PP_CDA * v * v * dist;
  var kcal = ((wGrav + wRoll + wAir) / PP_EFF) / 4184;
  var hours = ppTotalMinutes() / 60;
  var t = ppAvgTemp();
  var lph = 0.4 + Math.max(0, ((t == null ? 18 : t) - 15)) * 0.035;   // 0,4 l/h a 15 gradi, ~0,9 a 30
  return {
    kcal: Math.round(kcal),
    hours: hours,
    liters: Math.round(hours * lph * 10) / 10,
    carbsG: Math.round(hours * 60),            // 60 g/h di carboidrati: riferimento standard
    lph: Math.round(lph * 100) / 100,
    temp: t
  };
}

/* ------------------------------ selezione POI ------------------------------ */
/* Scorre il percorso nel tempo e tiene un punto ogni `interval` minuti, scegliendo
   il migliore in una finestra attorno al bersaglio. Punteggio: aperto al passaggio,
   vicinanza al tracciato, tipo utile (un forno vale piu' di un ristorante). */
function ppScore(item, isFood) {
  var s = 0;
  if (item.open === true) s += 100;
  else if (item.open === false) s -= 200;          // chiuso: praticamente da escludere
  s -= Math.min(60, (item.dist || 0) / 5);          // 300 m di deviazione = -60
  if (isFood) {
    var k = item.kind || "";
    if (k === "Panetteria" || k === "Alimentari") s += 25;   // aprono presto, si compra e si riparte
    else if (k === "Bar") s += 15;
    else if (k === "Ristorante") s -= 10;                     // lento, spesso solo a orario di pranzo
  } else if (item.pot === "Acqua potabile") s += 20;
  return s;
}
function ppPickSpaced(list, intervalMin, isFood) {
  if (!list || !list.length) return [];
  var out = [], lastT = 0;
  var total = ppTotalMinutes();
  var items = list.map(function (x) {
    var o = { ref: x, km: x.along, t: ppTimeAtKm(x.along) };
    o.score = ppScore(x, isFood);
    return o;
  }).filter(function (o) { return o.score > -150; });          // scarta i chiusi
  if (!items.length) return [];

  var target = intervalMin;
  while (target < total + intervalMin * 0.5) {
    var win = intervalMin * 0.45;
    var best = null;
    items.forEach(function (o) {
      if (o.used || o.t <= lastT + intervalMin * 0.35) return;   // troppo vicino al precedente
      if (Math.abs(o.t - target) > win) return;
      var sc = o.score - Math.abs(o.t - target) * 0.6;           // meglio se vicino al bersaglio
      if (!best || sc > best._sc) { best = o; best._sc = sc; }
    });
    if (best) { best.used = true; out.push(best.ref); lastT = best.t; target = best.t + intervalMin; }
    else target += intervalMin * 0.5;                            // finestra vuota: si prova piu' avanti
  }

  /* Ultimo punto prima di un buco lungo: se tra due soste selezionate (o dopo
     l'ultima) restano piu' di 1,5 intervalli senza nulla, si recupera il miglior
     punto disponibile prima del buco. E' la sosta che salva la giornata. */
  var chosen = out.slice().sort(function (a, b) { return a.along - b.along; });
  var check = [0].concat(chosen.map(function (c) { return ppTimeAtKm(c.along); })).concat([total]);
  for (var i = 1; i < check.length; i++) {
    var gap = check[i] - check[i - 1];
    if (gap <= intervalMin * 1.5) continue;
    var lo = check[i - 1], hi = check[i], cand = null;
    items.forEach(function (o) {
      if (o.used || o.t <= lo + 5 || o.t >= hi - 5) return;
      if (!cand || o.score > cand.score) cand = o;
    });
    if (cand) { cand.used = true; out.push(cand.ref); }
  }
  return out.sort(function (a, b) { return a.along - b.along; });
}

/* Restituisce i punti da mostrare secondo la modalita' scelta.
   { water:[...], food:[...], mode, info } */
function selectPOIs() {
  var mode = ppMode();
  var allW = (typeof routeWater !== "undefined" && routeWater) ? routeWater.slice() : [];
  var allF = (typeof rwStops !== "undefined" && rwStops) ? rwStops.slice() : [];

  // stato aperto/chiuso, se il meteo (e quindi l'orario) e' disponibile
  allF.forEach(function (s) {
    s.open = (typeof ohOpen === "function" && typeof rwEtaAt === "function" && typeof rwData !== "undefined" && rwData)
      ? ohOpen(s.oh, rwEtaAt(s.along)) : null;
  });

  var res = { mode: mode, info: ppEnergy(), waterInterval: ppWaterInterval(), foodInterval: ppFoodInterval() };
  if (mode === "none") { res.water = []; res.food = []; }
  else if (mode === "all") { res.water = allW; res.food = allF; }
  else if (mode === "water") { res.water = ppPickSpaced(allW, ppWaterInterval(), false); res.food = []; }
  else { // essential
    res.water = ppPickSpaced(allW, ppWaterInterval(), false);
    res.food = ppPickSpaced(allF, ppFoodInterval(), true);
  }
  res.totalWater = allW.length; res.totalFood = allF.length;
  return res;
}

/* ----------------------------- posizione del sole -------------------------- */
/* SunCalc e' gia' caricato nella pagina: nessuna richiesta di rete.
   Restituisce alba/tramonto nel giorno scelto e, per ogni punto della tabella
   oraria, se il sole sara' in faccia, di spalle o laterale. */
function ppSunTimes(lat, lon, ms) {
  if (typeof SunCalc === "undefined" || !ms) return null;
  try {
    var s = SunCalc.getTimes(new Date(ms), lat, lon);
    return { alba: s.sunrise ? s.sunrise.getTime() : null, tramonto: s.sunset ? s.sunset.getTime() : null };
  } catch (e) { return null; }
}
function ppSunAt(lat, lon, ms, bearing) {
  if (typeof SunCalc === "undefined" || !ms) return null;
  try {
    var p = SunCalc.getPosition(new Date(ms), lat, lon);
    var alt = p.altitude * 180 / Math.PI;
    var az = (p.azimuth * 180 / Math.PI + 180) % 360;      // 0 = Nord
    if (alt <= -0.5) return { alt: alt, az: az, kind: "buio", label: "buio" };
    if (alt < 6) return { alt: alt, az: az, kind: "basso", label: "sole radente" };
    var rel = ((az - (bearing == null ? az : bearing)) + 540) % 360 - 180;
    var kind = Math.abs(rel) < 45 ? "faccia" : Math.abs(rel) > 135 ? "spalle" : "lato";
    return {
      alt: alt, az: az, rel: rel, kind: kind,
      label: kind === "faccia" ? "in faccia" : kind === "spalle" ? "di spalle" : "laterale"
    };
  } catch (e) { return null; }
}

/* ------------------------- etichette per l'interfaccia --------------------- */
function ppModeLabel(m) {
  return m === "all" ? "tutti i punti"
    : m === "water" ? "solo acqua, distanziata"
    : m === "none" ? "nessun punto"
    : "essenziali";
}
/* ------------------- aggancio all'esportazione GPX ------------------------- */
/* gpxio.js chiama openStopsNow() per sapere quali ristori mettere nel file.
   Lo ridefiniamo perche' rispetti la modalita' scelta: sul ciclocomputer servono
   dieci bandierine utili, non centoquindici. Anche i punti acqua seguono la
   selezione, tramite ppWaterForGpx(). */
function openStopsNow() {
  var sel = selectPOIs();
  return sel.food || [];
}
function ppWaterForGpx() {
  var sel = selectPOIs();
  return sel.water || [];
}

/* Frase pronta da mettere nel roadbook o nel pannello. */
function ppSummaryText(sel) {
  if (!sel) return "";
  var i = sel.info;
  var s = "Selezione: <b>" + ppModeLabel(sel.mode) + "</b>";
  if (sel.mode === "essential" || sel.mode === "water") {
    s += " &middot; acqua ogni <b>" + sel.waterInterval + " min</b>";
    if (i && i.temp != null) s += " (temperatura media prevista " + Math.round(i.temp) + "&deg;C)";
    if (sel.mode === "essential") s += ", cibo ogni <b>" + sel.foodInterval + " min</b>";
  }
  return s;
}

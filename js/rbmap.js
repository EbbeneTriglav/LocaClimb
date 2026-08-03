/* ===========================================================================
   LocaRide - mappa del roadbook con sfondo cartografico reale
   ---------------------------------------------------------------------------
   Scarica le tessere OpenStreetMap dell'area del giro, ci disegna sopra
   percorso, tappe, acqua, ristori, scala e nord, e restituisce UNA immagine
   incorporata (data URL).

   PERCHE' INCORPORATA E NON UN <img> ALLE TESSERE
   Il roadbook si stampa: se le immagini fossero collegate alla rete, in stampa
   uscirebbero mancanti o sgranate, e ogni ristampa rifarebbe le richieste.
   Incorporandola, il foglio e' autonomo: si salva, si manda per mail, si stampa
   fra un mese in mezzo a una valle senza campo, e la mappa c'e' comunque.

   SE LE TESSERE NON ARRIVANO (rete assente, server lento, restrizioni del
   browser sul disegno di immagini esterne) si torna in automatico alla mappa
   vettoriale: nessun errore, solo uno sfondo piu' spartano.

   Uso delle tessere: una dozzina per roadbook, con attribuzione obbligatoria
   "© OpenStreetMap contributors" stampata sotto la mappa.
   =========================================================================== */

var RBMAP_W = 1400, RBMAP_H = 900;      // pixel: ~200 dpi su una mezza pagina A4
var RBMAP_TILE = 256;
var RBMAP_MAXTILES = 40;                 // tetto di sicurezza: niente scaricate assurde

function rbmTileX(lon, z) { return (lon + 180) / 360 * Math.pow(2, z); }
function rbmTileY(lat, z) {
  var la = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * Math.pow(2, z);
}

/* Sceglie lo zoom piu' alto (piu' dettaglio) in cui il giro sta dentro il riquadro. */
function rbmPickZoom(minLa, maxLa, minLo, maxLo, w, h) {
  for (var z = 15; z >= 5; z--) {
    var dx = (rbmTileX(maxLo, z) - rbmTileX(minLo, z)) * RBMAP_TILE;
    var dy = (rbmTileY(minLa, z) - rbmTileY(maxLa, z)) * RBMAP_TILE;
    if (dx <= w * 0.92 && dy <= h * 0.92) {
      var nt = (Math.ceil(dx / RBMAP_TILE) + 2) * (Math.ceil(dy / RBMAP_TILE) + 2);
      if (nt <= RBMAP_MAXTILES) return z;
    }
  }
  return 8;
}

/* cb(dataUrl | null) */
function rbmBuild(sel, places, cb) {
  if (!rbTrack || rbTrack.length < 2) { cb(null); return; }
  var minLa = 90, maxLa = -90, minLo = 180, maxLo = -180;
  rbTrack.forEach(function (p) {
    if (p[0] < minLa) minLa = p[0]; if (p[0] > maxLa) maxLa = p[0];
    if (p[1] < minLo) minLo = p[1]; if (p[1] > maxLo) maxLo = p[1];
  });
  var z = rbmPickZoom(minLa, maxLa, minLo, maxLo, RBMAP_W, RBMAP_H);

  // centro del giro in coordinate-tessera, poi origine del riquadro
  var cx = (rbmTileX(minLo, z) + rbmTileX(maxLo, z)) / 2;
  var cy = (rbmTileY(minLa, z) + rbmTileY(maxLa, z)) / 2;
  var originX = cx * RBMAP_TILE - RBMAP_W / 2;
  var originY = cy * RBMAP_TILE - RBMAP_H / 2;
  var P = function (la, lo) {
    return [rbmTileX(lo, z) * RBMAP_TILE - originX, rbmTileY(la, z) * RBMAP_TILE - originY];
  };

  var c = document.createElement("canvas");
  c.width = RBMAP_W; c.height = RBMAP_H;
  var x = c.getContext("2d");
  x.fillStyle = "#eef3f7"; x.fillRect(0, 0, RBMAP_W, RBMAP_H);

  var tx0 = Math.floor(originX / RBMAP_TILE), tx1 = Math.floor((originX + RBMAP_W) / RBMAP_TILE);
  var ty0 = Math.floor(originY / RBMAP_TILE), ty1 = Math.floor((originY + RBMAP_H) / RBMAP_TILE);
  var jobs = [], n = Math.pow(2, z);
  for (var tx = tx0; tx <= tx1; tx++) {
    for (var ty = ty0; ty <= ty1; ty++) {
      if (ty < 0 || ty >= n) continue;
      jobs.push([((tx % n) + n) % n, ty, tx, ty]);
    }
  }
  if (!jobs.length || jobs.length > RBMAP_MAXTILES) { cb(null); return; }

  var done = 0, failed = 0;
  var finish = function () {
    // percorso, marcatori e decorazioni sopra le tessere
    try {
      rbmDraw(x, P, sel, places);
      rbmScaleNorth(x, z, (minLa + maxLa) / 2);
      cb(failed > jobs.length / 2 ? null : c.toDataURL("image/png"));
    } catch (e) {
      // canvas "sporcato" da immagini esterne: non si puo' esportare -> ripiego vettoriale
      cb(null);
    }
  };
  jobs.forEach(function (j) {
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () {
      try { x.drawImage(img, j[2] * RBMAP_TILE - originX, j[3] * RBMAP_TILE - originY, RBMAP_TILE, RBMAP_TILE); } catch (e) {}
      if (++done + failed === jobs.length) finish();
    };
    img.onerror = function () { failed++; if (done + failed === jobs.length) finish(); };
    img.src = "https://tile.openstreetmap.org/" + z + "/" + j[0] + "/" + j[1] + ".png";
  });
  // rete lenta: dopo 9 secondi si procede con quello che e' arrivato
  setTimeout(function () { if (done + failed < jobs.length) { failed = jobs.length - done; finish(); } }, 9000);
}

function rbmDraw(x, P, sel, places) {
  // tracciato: alone bianco + linea blu, leggibile anche in bianco e nero
  x.lineJoin = "round"; x.lineCap = "round";
  x.beginPath();
  var step = Math.max(1, Math.floor(rbTrack.length / 1500));
  for (var i = 0; i < rbTrack.length; i += step) {
    var q = P(rbTrack[i][0], rbTrack[i][1]);
    if (!i) x.moveTo(q[0], q[1]); else x.lineTo(q[0], q[1]);
  }
  var last = P(rbTrack[rbTrack.length - 1][0], rbTrack[rbTrack.length - 1][1]);
  x.lineTo(last[0], last[1]);
  x.strokeStyle = "rgba(255,255,255,.85)"; x.lineWidth = 11; x.stroke();
  x.strokeStyle = "#1d4ed8"; x.lineWidth = 5; x.stroke();

  // paesi
  x.font = "600 15px system-ui,sans-serif"; x.textAlign = "left";
  (places || []).forEach(function (p) {
    if (p.lat == null) return;
    var q = P(p.lat, p.lon);
    x.beginPath(); x.arc(q[0], q[1], 3.5, 0, 6.2832);
    x.fillStyle = "#475569"; x.fill();
    x.lineWidth = 3; x.strokeStyle = "rgba(255,255,255,.9)";
    x.strokeText(p.name, q[0] + 7, q[1] + 5);
    x.fillStyle = "#0f172a"; x.fillText(p.name, q[0] + 7, q[1] + 5);
  });

  var dot = function (q, r, fill) {
    x.beginPath(); x.arc(q[0], q[1], r, 0, 6.2832);
    x.fillStyle = fill; x.fill();
    x.lineWidth = 2.5; x.strokeStyle = "#fff"; x.stroke();
  };
  (sel && sel.water ? sel.water : []).forEach(function (w) { if (w.lat != null) dot(P(w.lat, w.lon), 7, "#2563eb"); });
  (sel && sel.food ? sel.food : []).forEach(function (s) {
    if (s.lat == null) return;
    var q = P(s.lat, s.lon);
    x.beginPath(); x.rect(q[0] - 6.5, q[1] - 6.5, 13, 13);
    x.fillStyle = "#ea580c"; x.fill(); x.lineWidth = 2.5; x.strokeStyle = "#fff"; x.stroke();
  });
  (rbStops || []).forEach(function (s, i) {
    var q = P(s.lat, s.lon);
    var col = (i === 0) ? "#16a34a" : (i === rbStops.length - 1) ? "#dc2626" : "#7c3aed";
    dot(q, 12, col);
    x.fillStyle = "#fff"; x.font = "700 14px system-ui,sans-serif"; x.textAlign = "center";
    x.fillText(String(i + 1), q[0], q[1] + 5);
    x.textAlign = "left";
  });
}

/* Scala metrica e freccia del nord, in basso a sinistra e in alto a destra. */
function rbmScaleNorth(x, z, midLat) {
  var mPerPx = 156543.03392 * Math.cos(midLat * Math.PI / 180) / Math.pow(2, z);
  var nice = [1, 2, 5, 10, 20, 50, 100], target = RBMAP_W * 0.22 * mPerPx / 1000, km = 1;
  for (var i = 0; i < nice.length; i++) if (nice[i] <= target) km = nice[i];
  var px = km * 1000 / mPerPx, bx = 40, by = RBMAP_H - 40;

  x.fillStyle = "rgba(255,255,255,.88)";
  x.fillRect(bx - 14, by - 34, px + 28, 48);
  x.strokeStyle = "#0f172a"; x.lineWidth = 3;
  x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + px, by); x.stroke();
  x.beginPath(); x.moveTo(bx, by - 7); x.lineTo(bx, by + 7); x.moveTo(bx + px, by - 7); x.lineTo(bx + px, by + 7); x.stroke();
  x.fillStyle = "#0f172a"; x.font = "700 16px system-ui,sans-serif"; x.textAlign = "center";
  x.fillText(km + " km", bx + px / 2, by - 12);

  var nx = RBMAP_W - 46, ny = 52;
  x.fillStyle = "rgba(255,255,255,.88)";
  x.beginPath(); x.arc(nx, ny - 4, 30, 0, 6.2832); x.fill();
  x.strokeStyle = "#0f172a"; x.lineWidth = 3;
  x.beginPath(); x.moveTo(nx, ny + 14); x.lineTo(nx, ny - 18); x.stroke();
  x.beginPath(); x.moveTo(nx - 7, ny - 8); x.lineTo(nx, ny - 22); x.lineTo(nx + 7, ny - 8); x.closePath();
  x.fillStyle = "#0f172a"; x.fill();
  x.font = "700 15px system-ui,sans-serif"; x.textAlign = "center";
  x.fillText("N", nx, ny + 28);
}

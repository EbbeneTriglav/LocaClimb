/* ===========================================================================
   LocaRide - Immagine condivisibile del giro
   ---------------------------------------------------------------------------
   Genera una card PNG 1080x1080 con: tracciato stilizzato, profilo altimetrico
   colorato per pendenza, statistiche e logo. Poi la scarica o la passa al menu
   di condivisione del telefono (Instagram, WhatsApp, Messaggi...).

   SCELTA DI PROGETTO: la card NON usa le tessere della mappa.
   Motivo pratico: disegnare tessere esterne su un canvas puo' "contaminarlo"
   (regole CORS del browser) e impedire l'esportazione in PNG proprio nel
   momento in cui serve; in piu' richiederebbe di scaricare 9-16 immagini a
   ogni condivisione. Il tracciato vettoriale su fondo scuro e' immediato,
   sempre affidabile e graficamente piu' pulito per i social.

   NON dipende da myrides.js ne' da share.js: lavora sul percorso attualmente
   caricato (creato, importato, riaperto o arrivato da un link condiviso).
   =========================================================================== */

var CARD_W = 1080, CARD_H = 1080;

/* Colore in base alla pendenza (stessa scala del profilo nell'app). */
function cardGrad(g) {
  if (g < -0.02) return "#38bdf8";
  if (g < 0.02) return "#22c55e";
  if (g < 0.05) return "#84cc16";
  if (g < 0.08) return "#facc15";
  if (g < 0.11) return "#f97316";
  return "#dc2626";
}
function cardRound(x, w, h, r) { }   /* placeholder non usato */

/* Proietta lat/lon in coordinate schermo dentro un riquadro, mantenendo le proporzioni. */
function cardProject(track, x0, y0, w, h) {
  var minLa = 90, maxLa = -90, minLo = 180, maxLo = -180;
  for (var i = 0; i < track.length; i++) {
    if (track[i][0] < minLa) minLa = track[i][0];
    if (track[i][0] > maxLa) maxLa = track[i][0];
    if (track[i][1] < minLo) minLo = track[i][1];
    if (track[i][1] > maxLo) maxLo = track[i][1];
  }
  var midLa = (minLa + maxLa) / 2;
  var kx = Math.cos(midLa * Math.PI / 180);           // i gradi di longitudine si accorciano con la latitudine
  var dLa = Math.max(1e-6, maxLa - minLa);
  var dLo = Math.max(1e-6, (maxLo - minLo) * kx);
  var sc = Math.min(w / dLo, h / dLa);
  var offX = x0 + (w - dLo * sc) / 2;
  var offY = y0 + (h - dLa * sc) / 2;
  return track.map(function (p) {
    return [offX + ((p[1] - minLo) * kx) * sc, offY + (maxLa - p[0]) * sc];
  });
}

/* Costruisce la card. rideName opzionale; usa il percorso in memoria. */
function buildShareCard(rideName) {
  if (!rbTrack || rbTrack.length < 2) return null;
  var c = document.createElement("canvas");
  c.width = CARD_W; c.height = CARD_H;
  var x = c.getContext("2d");

  /* --- sfondo --- */
  var bg = x.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, "#0f172a"); bg.addColorStop(0.55, "#152648"); bg.addColorStop(1, "#2e1065");
  x.fillStyle = bg; x.fillRect(0, 0, CARD_W, CARD_H);

  /* --- intestazione: logo + wordmark --- */
  x.save();
  x.translate(64, 62);
  var lg = x.createLinearGradient(0, 0, 46, 46);
  lg.addColorStop(0, "#3b82f6"); lg.addColorStop(1, "#a855f7");
  x.fillStyle = lg;
  x.beginPath();                                   // montagna stilizzata (come il logo dell'app)
  x.moveTo(2, 38); x.lineTo(16, 10); x.lineTo(25, 25); x.lineTo(31, 16); x.lineTo(44, 38);
  x.closePath(); x.fill();
  x.strokeStyle = "#f59e0b"; x.lineWidth = 3.4; x.lineCap = "round";
  x.beginPath(); x.moveTo(4, 38); x.quadraticCurveTo(16, 32, 23, 38); x.quadraticCurveTo(31, 44, 43, 38); x.stroke();
  x.restore();
  x.font = "700 40px system-ui,-apple-system,Segoe UI,sans-serif";
  x.fillStyle = "#e2e8f0"; x.textAlign = "left";
  x.fillText("Loca", 126, 96);
  var lw = x.measureText("Loca").width;
  x.fillStyle = "#a855f7"; x.font = "900 40px system-ui,-apple-system,Segoe UI,sans-serif";
  x.fillText("Ride", 126 + lw, 96);

  /* --- titolo del giro --- */
  var title = rideName || (rbStops && rbStops.length ? rbStops.map(function (s) { return s.name; }).join(" · ") : "Il mio giro");
  x.fillStyle = "#ffffff"; x.font = "800 52px system-ui,-apple-system,Segoe UI,sans-serif";
  cardWrapText(x, title, 64, 176, CARD_W - 128, 58, 2);

  /* --- tracciato --- */
  var boxY = 250, boxH = 430;
  var pts = cardProject(rbTrack.map(function (p) { return [p[0], p[1]]; }), 90, boxY, CARD_W - 180, boxH);
  x.lineJoin = "round"; x.lineCap = "round";
  x.strokeStyle = "rgba(255,255,255,.20)"; x.lineWidth = 20;   // alone morbido
  cardPath(x, pts); x.stroke();
  var rg = x.createLinearGradient(0, boxY, CARD_W, boxY + boxH);
  rg.addColorStop(0, "#22c55e"); rg.addColorStop(0.5, "#38bdf8"); rg.addColorStop(1, "#a855f7");
  x.strokeStyle = rg; x.lineWidth = 9;
  cardPath(x, pts); x.stroke();
  // punti di partenza e arrivo
  cardDot(x, pts[0][0], pts[0][1], "#22c55e");
  cardDot(x, pts[pts.length - 1][0], pts[pts.length - 1][1], "#ef4444");

  /* --- profilo altimetrico --- */
  var els = rbTrack.map(function (t) { return t[2]; }).filter(function (v) { return v != null; });
  var pY = 720, pH = 170, pX = 64, pW = CARD_W - 128;
  if (els.length > 1) {
    var mn = Math.min.apply(null, els), mx = Math.max.apply(null, els), rng = Math.max(1, mx - mn);
    var n = 260, ser = [];
    for (var k = 0; k < n; k++) {
      var idx = Math.round(k * (rbTrack.length - 1) / (n - 1));
      var e = rbTrack[idx][2];
      ser.push(e == null ? (ser.length ? ser[ser.length - 1] : mn) : e);
    }
    var totM = trackDist(rbTrack) * 1000, mPer = totM / n;
    for (var k2 = 1; k2 < n; k2++) {
      var g = (ser[k2] - ser[k2 - 1]) / Math.max(1, mPer);
      var xx = pX + (k2 / n) * pW, yy = pY + pH - ((ser[k2] - mn) / rng) * pH;
      x.fillStyle = cardGrad(g); x.globalAlpha = 0.85;
      x.fillRect(xx, yy, Math.ceil(pW / n) + 1, pY + pH - yy);
    }
    x.globalAlpha = 1;
    x.strokeStyle = "rgba(255,255,255,.75)"; x.lineWidth = 2.5;
    x.beginPath();
    for (var k3 = 0; k3 < n; k3++) {
      var px2 = pX + (k3 / n) * pW, py2 = pY + pH - ((ser[k3] - mn) / rng) * pH;
      if (!k3) x.moveTo(px2, py2); else x.lineTo(px2, py2);
    }
    x.stroke();
    x.strokeStyle = "rgba(255,255,255,.18)"; x.lineWidth = 1;
    x.beginPath(); x.moveTo(pX, pY + pH); x.lineTo(pX + pW, pY + pH); x.stroke();
  }

  /* --- statistiche --- */
  var dist = trackDist(rbTrack), asc = trackAscent(rbTrack);
  var top = els.length ? Math.round(Math.max.apply(null, els)) : null;
  var stats = [["DISTANZA", dist.toFixed(1) + " km"], ["DISLIVELLO", asc + " m"]];
  if (top != null) stats.push(["QUOTA MAX", top + " m"]);
  stats.push(["TAPPE", String(rbStops ? rbStops.length : 0)]);
  var colW = (CARD_W - 128) / stats.length;
  stats.forEach(function (s, i) {
    var cx = 64 + colW * i + colW / 2;
    x.textAlign = "center";
    x.fillStyle = "#94a3b8"; x.font = "600 22px system-ui,-apple-system,Segoe UI,sans-serif";
    x.fillText(s[0], cx, 960);
    x.fillStyle = "#ffffff"; x.font = "800 46px system-ui,-apple-system,Segoe UI,sans-serif";
    x.fillText(s[1], cx, 1010);
  });

  /* --- piè di pagina --- */
  x.textAlign = "center";
  x.fillStyle = "#64748b"; x.font = "600 24px system-ui,-apple-system,Segoe UI,sans-serif";
  x.fillText("locaride.app  ·  ride like a local", CARD_W / 2, 1058);
  return c;
}

function cardPath(x, pts) {
  x.beginPath();
  for (var i = 0; i < pts.length; i++) { if (!i) x.moveTo(pts[i][0], pts[i][1]); else x.lineTo(pts[i][0], pts[i][1]); }
}
function cardDot(x, cx, cy, col) {
  x.beginPath(); x.arc(cx, cy, 13, 0, 6.2832);
  x.fillStyle = col; x.fill();
  x.lineWidth = 5; x.strokeStyle = "#ffffff"; x.stroke();
}
/* Testo a capo automatico, massimo `maxLines` righe (poi taglia con i puntini). */
function cardWrapText(x, text, tx, ty, maxW, lineH, maxLines) {
  var words = String(text).split(/\s+/), line = "", lines = [];
  for (var i = 0; i < words.length; i++) {
    var test = line ? line + " " + words[i] : words[i];
    if (x.measureText(test).width > maxW && line) { lines.push(line); line = words[i]; }
    else line = test;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    var last = lines[maxLines - 1];
    while (x.measureText(last + "…").width > maxW && last.length > 3) last = last.slice(0, -1);
    if (words.join(" ").length > lines.join(" ").length) lines[maxLines - 1] = last + "…";
  }
  lines.forEach(function (l, i) { x.fillText(l, tx, ty + i * lineH); });
}

/* ------------------------------- interfaccia ------------------------------- */

function openShareCard() {
  if (!rbTrack || rbTrack.length < 2) { if (typeof flashInfo === "function") flashInfo("Calcola o apri prima un percorso."); return; }
  var c = buildShareCard(null);
  if (!c) return;
  var ex = document.getElementById("cardModal"); if (ex) ex.remove();
  var d = document.createElement("div");
  d.id = "cardModal";
  d.style.cssText = "position:fixed;inset:0;z-index:3200;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px";
  var btn = "display:block;width:100%;margin:6px 0;padding:11px;border:none;border-radius:9px;cursor:pointer;font:inherit;font-weight:600;color:#fff";
  d.innerHTML = '<div style="background:var(--bg2);color:var(--txt);border-radius:14px;padding:16px;width:400px;max-width:100%;max-height:92vh;overflow:auto;font:14px system-ui">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><b>&#x1F5BC;&#xFE0F; Immagine del giro</b>'
    + '<span data-act="cardClose" style="cursor:pointer;font-size:20px">&times;</span></div>'
    + '<div id="cardHolder" style="border-radius:10px;overflow:hidden;border:1px solid var(--bdr)"></div>'
    + '<button style="' + btn + ';background:#2563eb" data-act="cardDownload">&#x2B07;&#xFE0F; Scarica PNG</button>'
    + (navigator.share ? '<button style="' + btn + ';background:#7c3aed" data-act="cardShare">&#x1F4F1; Condividi (Instagram, WhatsApp&#8230;)</button>' : '')
    + '<div style="font-size:.74rem;color:var(--txt2);margin-top:6px">Su Instagram si pubblica come immagine: scaricala o usa il tasto Condividi dal telefono.</div>'
    + '</div>';
  document.body.appendChild(d);
  c.style.width = "100%"; c.style.display = "block";
  document.getElementById("cardHolder").appendChild(c);
  window.__card = c;
}
function cardClose() { var m = document.getElementById("cardModal"); if (m) m.remove(); }

function cardFileName() {
  var n = (rbStops && rbStops.length ? rbStops[0].name : "giro");
  return "locaride_" + String(n).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") + ".png";
}
function cardDownload() {
  var c = window.__card; if (!c) return;
  try {
    var a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = cardFileName();
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  } catch (e) { alert("Impossibile esportare l'immagine: " + (e.message || e)); }
}
/* Condivisione nativa del FILE: e' questa che apre Instagram/WhatsApp sul telefono. */
function cardShare() {
  var c = window.__card; if (!c || !c.toBlob) return;
  c.toBlob(function (blob) {
    if (!blob) return;
    var file = new File([blob], cardFileName(), { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: "LocaRide", text: "Il mio giro su LocaRide" }).catch(function () {});
    } else {
      cardDownload();   // il browser non sa condividere file: ripiego sul download
    }
  }, "image/png");
}

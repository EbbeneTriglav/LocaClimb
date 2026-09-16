/* ============================================================================
 * shadeindex.js - quanta ombra c'e' davvero su questa salita, in questo mese.
 * ----------------------------------------------------------------------------
 * Sostituisce sunexposure.js. Quello rispondeva "quante ore di luce ci sono",
 * che e' astronomia e non dice nulla di utile: due versanti opposti nello stesso
 * giorno avevano lo stesso numero. Qui il dato e' l'OMBRA, e viene da tre cause
 * misurate offline da scripts/build_shade.mjs:
 *
 *   - rilievi   : l'orizzonte del terreno (la cresta di fronte)
 *   - bosco     : la chioma trattata come orizzonte, con specie e stagione
 *   - versante  : pendenza ed esposizione locali
 *
 * Tutto e' precalcolato mese per mese, quindi il pannello non fa astronomia:
 * legge data/shade.json, spacchetta 72 caratteri e disegna. L'indice cambia con
 * il mese che si sta guardando, perche' cambiano l'altezza del sole e le foglie.
 *
 * Mantiene i nomi sunCellStub(i) / renderSunCells(p): js/panel.js resta com'e'.
 * Nessuna dipendenza esterna (niente SunCalc). 100% ASCII.
 * ==========================================================================*/

var SHX = { data: null, pending: null, month: (new Date()).getMonth() + 1 };
var SHX_MON = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

function shLoad() {
  if (SHX.data) return Promise.resolve(SHX.data);
  if (SHX.pending) return SHX.pending;
  SHX.pending = fetch(DATA_DIR + "shade.json", { cache: "force-cache" })
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (o) { SHX.data = (o && o.m) || {}; return SHX.data; })
    .catch(function () { SHX.data = {}; return SHX.data; });
  return SHX.pending;
}

/* 72 caratteri -> 12 mesi x [ore di sole pieno, ombra %, quota rilievi %] */
function shUnpack(s) {
  if (!s || s.length < 72) return null;
  var out = [];
  for (var i = 0; i < 12; i++) {
    var c = s.substr(i * 6, 6);
    out.push({
      sun: parseInt(c.substr(0, 2), 36) / 10,
      shade: parseInt(c.substr(2, 2), 36),
      terr: parseInt(c.substr(4, 2), 36)
    });
  }
  return out;
}

function shGet(p, v) {
  if (!SHX.data) return null;
  return shUnpack(SHX.data[p.id + "|" + (v.side || "")]);
}

/* una parola onesta al posto di una percentuale nuda */
function shWord(pct) {
  if (pct < 12) return "Pieno sole";
  if (pct < 30) return "Poca ombra";
  if (pct < 50) return "Ombra a tratti";
  if (pct < 70) return "Molta ombra";
  return "Quasi sempre ombra";
}
function shTone(pct) {
  /* ambra -> indaco: piu' ombra, piu' freddo il colore. Una sola scala, niente arcobaleni */
  var t = Math.max(0, Math.min(1, pct / 100));
  var r = Math.round(245 - 150 * t), g = Math.round(158 - 40 * t), b = Math.round(11 + 180 * t);
  return "rgb(" + r + "," + g + "," + b + ")";
}

function shCellHTML(rows) {
  if (!rows) return '<span class="shx-na" title="Dato non ancora calcolato per questa salita">n/d</span>';
  var m = SHX.month, cur = rows[m - 1];
  var woods = 100 - cur.terr;
  var h = '<div class="shx-h" style="color:' + shTone(cur.shade) + '">' + cur.shade + '%</div>';
  h += '<div class="shx-w">' + shWord(cur.shade) + '</div>';

  /* da cosa dipende: solo le cause che pesano davvero */
  var parts = [];
  if (cur.shade >= 8) {
    if (woods >= 20) parts.push("bosco " + Math.round(cur.shade * woods / 100) + "%");
    if (cur.terr >= 20) parts.push("rilievi " + Math.round(cur.shade * cur.terr / 100) + "%");
  }
  h += '<div class="shx-sub">' + (parts.length ? parts.join(" &middot; ") : "sole diretto " + String(cur.sun).replace(".", ",") + " h") + '</div>';

  /* andamento nei 12 mesi: dice in che stagione vale la pena venirci */
  h += '<div class="shx-yr" title="Ombra mese per mese">';
  for (var i = 0; i < 12; i++) {
    var v = rows[i].shade;
    h += '<i class="' + (i === m - 1 ? "on" : "") + '" style="background:' + shTone(v) + ';height:' + Math.max(3, Math.round(3 + v * 0.11)) + 'px" title="' + SHX_MON[i] + ': ' + v + '% di ombra"></i>';
  }
  h += '</div>';
  return h;
}

function sunCellStub(i) { return '<div class="shx" id="shx-' + i + '"><span class="shx-wait">&#8230;</span></div>'; }

function renderSunCells(p) {
  if (!p || !p.versanti || !p.versanti.length) return;
  shLoad().then(function () {
    p.versanti.forEach(function (v, i) {
      var el = document.getElementById("shx-" + i);
      if (!el) return;
      var rows = shGet(p, v);
      el.innerHTML = shCellHTML(rows);
      if (rows) el.title = "Ombra media sul tracciato a " + SHX_MON[SHX.month - 1]
        + ": rilievi, bosco ed esposizione del versante. Sole pieno " + String(rows[SHX.month - 1].sun).replace(".", ",") + " h.";
    });
  });
}

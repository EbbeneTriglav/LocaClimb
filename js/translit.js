/* translit.js — rende leggibili i nomi in greco e cirillico traslitterandoli in latino.
 *
 * Modulo AUTONOMO. Non tocca i file dati ne' data.js: al caricamento (e ad ogni
 * aggiornamento) riscrive in latino il campo .name dei passi che sono in greco/cirillico,
 * conservando l'originale in .nameLocal. Per rimuoverlo: togli la riga <script> da index.html.
 *
 * Copertura: greco (Grecia) e cirillico (Serbia, Bulgaria, Macedonia del Nord). La resa e'
 * "leggibile", non uno standard accademico: Διάσελο -> Diaselo, Връх -> Vrah.
 */
(function () {
  "use strict";

  // digrammi greci (prima della mappa lettera-per-lettera)
  var GR_DI = [
    ["ΟΥ", "OU"], ["Ου", "Ou"], ["ου", "ou"],
    ["ΜΠ", "B"], ["Μπ", "B"], ["μπ", "b"],
    ["ΝΤ", "D"], ["Ντ", "D"], ["ντ", "nt"],
    ["ΓΚ", "G"], ["Γκ", "G"], ["γκ", "g"],
    ["ΓΓ", "NG"], ["γγ", "ng"],
    ["ΤΣ", "TS"], ["Τσ", "Ts"], ["τσ", "ts"],
    ["ΤΖ", "TZ"], ["Τζ", "Tz"], ["τζ", "tz"]
  ];
  var GR = {
    "α":"a","ά":"a","β":"v","γ":"g","δ":"d","ε":"e","έ":"e","ζ":"z","η":"i","ή":"i",
    "θ":"th","ι":"i","ί":"i","ϊ":"i","ΐ":"i","κ":"k","λ":"l","μ":"m","ν":"n","ξ":"x",
    "ο":"o","ό":"o","π":"p","ρ":"r","σ":"s","ς":"s","τ":"t","υ":"y","ύ":"y","ϋ":"y","ΰ":"y",
    "φ":"f","χ":"ch","ψ":"ps","ω":"o","ώ":"o",
    "Α":"A","Ά":"A","Β":"V","Γ":"G","Δ":"D","Ε":"E","Έ":"E","Ζ":"Z","Η":"I","Ή":"I",
    "Θ":"Th","Ι":"I","Ί":"I","Ϊ":"I","Κ":"K","Λ":"L","Μ":"M","Ν":"N","Ξ":"X",
    "Ο":"O","Ό":"O","Π":"P","Ρ":"R","Σ":"S","Τ":"T","Υ":"Y","Ύ":"Y","Ϋ":"Y",
    "Φ":"F","Χ":"Ch","Ψ":"Ps","Ω":"O","Ώ":"O"
  };
  var CY = {
    "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"e","ж":"zh","з":"z","и":"i","й":"y",
    "к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f",
    "х":"h","ц":"ts","ч":"ch","ш":"sh","щ":"sht","ъ":"a","ь":"","ю":"yu","я":"ya","ы":"y","э":"e",
    "і":"i","ј":"j","љ":"lj","њ":"nj","ћ":"c","ђ":"dj","џ":"dz","ѓ":"gj","ќ":"kj","ѕ":"dz","ў":"u",
    "А":"A","Б":"B","В":"V","Г":"G","Д":"D","Е":"E","Ж":"Zh","З":"Z","И":"I","Й":"Y",
    "К":"K","Л":"L","М":"M","Н":"N","О":"O","П":"P","Р":"R","С":"S","Т":"T","У":"U","Ф":"F",
    "Х":"H","Ц":"Ts","Ч":"Ch","Ш":"Sh","Щ":"Sht","Ю":"Yu","Я":"Ya","Ы":"Y","Э":"E",
    "І":"I","Ј":"J","Љ":"Lj","Њ":"Nj","Ћ":"C","Ђ":"Dj","Џ":"Dz","Ѓ":"Gj","Ќ":"Kj"
  };

  function isForeign(s) { return /[Ͱ-ϿЀ-ӿ]/.test(s); }

  function transliterate(s) {
    if (!s || !isForeign(s)) return s;
    for (var i = 0; i < GR_DI.length; i++) s = s.split(GR_DI[i][0]).join(GR_DI[i][1]);
    var out = "";
    for (var j = 0; j < s.length; j++) {
      var c = s[j];
      out += (GR[c] != null) ? GR[c] : (CY[c] != null ? CY[c] : c);
    }
    return out;
  }
  window.transliterateName = transliterate; // esposto per debug

  function fix(p) {
    if (!p || !p.name || p._tr) return;
    if (isForeign(p.name)) { p.nameLocal = p.name; p.name = transliterate(p.name); }
    p._tr = 1; // marchia: non ritraslitterare
  }
  function all() {
    if (window.osmPasses) window.osmPasses.forEach(fix);
    if (window.PASSES_DATA) window.PASSES_DATA.forEach(fix);
  }

  // Aggancio non invasivo: dopo ogni funzione che carica/aggiorna i passi, ripassa.
  ["adoptOsm", "hydrateOsm", "applyManual", "addMarkers"].forEach(function (fn) {
    var orig = window[fn];
    if (typeof orig === "function") {
      window[fn] = function () { var r = orig.apply(this, arguments); try { all(); } catch (e) {} return r; };
    }
  });

  all();
  // rete di sicurezza per il caricamento asincrono (index -> region files)
  var n = 0, t = setInterval(function () { all(); if (++n >= 12) clearInterval(t); }, 1500);
})();

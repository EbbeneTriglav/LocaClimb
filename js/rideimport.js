/* ==========================================================================
 * rideimport.js - "Le tue salite" da TUTTI i tuoi giri: GPX, FIT, TCX, .gz, piu'
 * file insieme e lo zip dell'export completo di Strava o Garmin Connect.
 *
 * Perche': le salite dell'utente devono essere quelle fatte davvero, con i tempi
 * misurati dal dispositivo. Un file alla volta va bene per il giro di ieri; per lo
 * storico serve l'export completo (Strava: Impostazioni > Il mio account > Scarica
 * i tuoi dati; Garmin: Gestione dati > Esporta dati), che e' uno zip con un file per
 * attivita' (Strava: activities/*.gpx|.fit.gz|.tcx.gz; Garmin: zip annidati di .fit).
 *
 * Tutto nel browser, nessuna libreria: lo zip si legge a pezzi (File.slice) dalla
 * directory centrale, cosi' un export di qualche GB non va in memoria; la
 * decompressione usa DecompressionStream ("deflate-raw" / "gzip"). Il FIT e' letto
 * da un decoder minimo (solo i messaggi "record": posizione, quota, ora).
 * Privacy: i file non escono dal dispositivo; si salvano solo le salite note trovate
 * (data, versante, tempi) in "Le mie salite" (users/{uid}/climbs, privato).
 *
 * Dipende da: gpxclimbs.js (gcParse, gcAnalyzePts, gcAllPasses, gcShow, gcDur, gcNum,
 * gcEsc, gcT), myclimbs.js (mcEntriesFrom, mcSaveEntries), contribute.js (lrcModal,
 * lrcClose). Le funzioni ri* senza DOM sono pure e testate (test/ride-import.test.mjs). ASCII.
 * ==========================================================================*/

var RI = { FIT_EPOCH: 631065600, busy: false, last: null };
function riT(it, en) { return typeof lrcT === "function" ? lrcT(it, en) : it; }

/* ------------------------------------------------------------------ FIT */
/* Ritorna { pts: [[lat, lon, ele|null, ms]], date } dai messaggi "record" (globale 20).
   Gestisce header compressi (timestamp a 5 bit), campi developer, big/little endian. */
function riFitParse(buf) {
  var dv = ArrayBuffer.isView(buf) ? new DataView(buf.buffer, buf.byteOffset, buf.byteLength) : new DataView(buf);
  if (dv.byteLength < 14) return { err: "fit" };
  var hs = dv.getUint8(0);
  if (hs < 12 || String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11)) !== ".FIT") return { err: "fit" };
  var end = Math.min(dv.byteLength, hs + dv.getUint32(4, true)), pos = hs;
  var defs = {}, pts = [], lastTs = null;
  var SEMI = 180 / 2147483648;
  function rd(off, size, base, le) {
    switch (base & 0x1F) {
      case 0x01: return dv.getInt8(off);                                   // sint8
      case 0x02: case 0x00: case 0x0A: case 0x0D: return dv.getUint8(off); // uint8, enum, uint8z, byte
      case 0x03: return size >= 2 ? dv.getInt16(off, le) : null;           // sint16
      case 0x04: case 0x0B: return size >= 2 ? dv.getUint16(off, le) : null; // uint16(z)
      case 0x05: return size >= 4 ? dv.getInt32(off, le) : null;           // sint32
      case 0x06: case 0x0C: return size >= 4 ? dv.getUint32(off, le) : null; // uint32(z)
      default: return null;
    }
  }
  while (pos < end) {
    var h = dv.getUint8(pos++), lt, def, ts = null;
    if (h & 0x80) {                                  // compressed timestamp header
      lt = (h >> 5) & 0x03; def = defs[lt];
      if (lastTs != null) { var off5 = h & 0x1F; ts = (lastTs & ~0x1F) + off5; if (off5 < (lastTs & 0x1F)) ts += 0x20; lastTs = ts; }
    } else if (h & 0x40) {                           // definition message
      lt = h & 0x0F;
      if (pos + 5 > end) break;
      var le = dv.getUint8(pos + 1) === 0, gnum = dv.getUint16(pos + 2, le), nf = dv.getUint8(pos + 4), fields = [], size = 0;
      pos += 5;
      for (var f = 0; f < nf; f++) { fields.push({ num: dv.getUint8(pos), size: dv.getUint8(pos + 1), base: dv.getUint8(pos + 2) }); size += dv.getUint8(pos + 1); pos += 3; }
      if (h & 0x20) { var nd = dv.getUint8(pos++); for (var k = 0; k < nd; k++) { size += dv.getUint8(pos + 1); pos += 3; } }
      defs[lt] = { le: le, g: gnum, fields: fields, size: size };
      continue;
    } else {
      lt = h & 0x0F; def = defs[lt];
    }
    if (!def) break;                                 // data before its definition: corrupt file
    if (pos + def.size > end) break;
    var o = pos, rec = def.g === 20, lat = null, lon = null, alt = null, ealt = null;
    for (var j = 0; j < def.fields.length; j++) {
      var fd = def.fields[j];
      if (fd.num === 253) { var t = rd(o, fd.size, fd.base, def.le); if (t != null && t !== 0xFFFFFFFF) { ts = t; lastTs = t; } }
      else if (rec && fd.num === 0) { var a = rd(o, fd.size, fd.base, def.le); if (a != null && a !== 0x7FFFFFFF) lat = a * SEMI; }
      else if (rec && fd.num === 1) { var b = rd(o, fd.size, fd.base, def.le); if (b != null && b !== 0x7FFFFFFF) lon = b * SEMI; }
      else if (rec && fd.num === 2) { var c = rd(o, fd.size, fd.base, def.le); if (c != null && c !== 0xFFFF) alt = c / 5 - 500; }
      else if (rec && fd.num === 78) { var e = rd(o, fd.size, fd.base, def.le); if (e != null && e !== 0xFFFFFFFF) ealt = e / 5 - 500; }
      o += fd.size;
    }
    pos += def.size;
    if (rec && lat != null && lon != null && ts != null)
      pts.push([+lat.toFixed(6), +lon.toFixed(6), ealt != null ? +ealt.toFixed(1) : (alt != null ? +alt.toFixed(1) : null), (ts + RI.FIT_EPOCH) * 1000]);
  }
  return { pts: pts, date: pts.length ? new Date(pts[0][3]).toISOString().slice(0, 10) : null };
}

/* ------------------------------------------------------------------ TCX */
function riTcxParse(text) {
  var out = [], re = /<Trackpoint>([\s\S]*?)<\/Trackpoint>/g, m;
  while ((m = re.exec(String(text || ""))) !== null) {
    var b = m[1];
    var la = /<LatitudeDegrees>\s*([-+\d.eE]+)/.exec(b), lo = /<LongitudeDegrees>\s*([-+\d.eE]+)/.exec(b);
    if (!la || !lo) continue;
    var el = /<AltitudeMeters>\s*([-+\d.eE]+)/.exec(b), tm = /<Time>\s*([^<\s]+)/.exec(b);
    var p = [+la[1], +lo[1], el ? +el[1] : null];
    if (tm) { var t = Date.parse(tm[1]); if (isFinite(t)) p.push(t); }
    out.push(p);
  }
  return { pts: out, date: out.length && out[0][3] ? new Date(out[0][3]).toISOString().slice(0, 10) : null };
}

/* -------------------------------------------------------------- tipo file */
/* "activities/123.fit.gz" -> { fmt: "fit", gz: true }; null = non e' un giro (foto, csv...) */
function riKind(name) {
  var n = String(name || "").toLowerCase().replace(/^.*[\\/]/, "");
  var gz = /\.gz$/.test(n); if (gz) n = n.slice(0, -3);
  var m = /\.(gpx|fit|tcx|zip)$/.exec(n);
  return m ? { fmt: m[1], gz: gz } : null;
}

/* bytes di un giro -> punti. GPX/TCX come testo, FIT come binario. */
function riPoints(fmt, u8) {
  if (fmt === "fit") return riFitParse(u8);
  var text = new TextDecoder("utf-8").decode(u8);
  if (fmt === "tcx") return riTcxParse(text);
  return { pts: gcParse(text), date: typeof gcRideDate === "function" ? gcRideDate(text) : null };
}

/* -------------------------------------------------------------------- ZIP */
/* Elenco dei file dalla directory centrale (anche ZIP64). src: Blob/File. */
function riU64(dv, o) { return dv.getUint32(o, true) + dv.getUint32(o + 4, true) * 4294967296; }
function riZipList(src) {
  var tail = Math.min(src.size, 65536 + 22);
  return src.slice(src.size - tail).arrayBuffer().then(function (ab) {
    var dv = new DataView(ab), i, eocd = -1;
    for (i = ab.byteLength - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("zip");
    var cdSize = dv.getUint32(eocd + 12, true), cdOff = dv.getUint32(eocd + 16, true);
    var z64 = eocd >= 20 && dv.getUint32(eocd - 20, true) === 0x07064b50 ? riU64(dv, eocd - 20 + 8) : null;
    var pre = (z64 != null && (cdOff === 0xFFFFFFFF || cdSize === 0xFFFFFFFF))
      ? src.slice(z64, z64 + 56).arrayBuffer().then(function (b) { var d = new DataView(b); return { size: riU64(d, 40), off: riU64(d, 48) }; })
      : Promise.resolve({ size: cdSize, off: cdOff });
    return pre.then(function (cd) { return src.slice(cd.off, cd.off + cd.size).arrayBuffer(); });
  }).then(function (ab) {
    var dv = new DataView(ab), p = 0, out = [], td = new TextDecoder("utf-8");
    while (p + 46 <= ab.byteLength && dv.getUint32(p, true) === 0x02014b50) {
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      var nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      var name = td.decode(new Uint8Array(ab, p + 46, nl));
      var x = p + 46 + nl, xe = x + xl;
      while (x + 4 <= xe) {                           // ZIP64 extra: only the fields that overflowed, in order
        var id = dv.getUint16(x, true), sz = dv.getUint16(x + 2, true), q = x + 4;
        if (id === 0x0001) {
          if (usize === 0xFFFFFFFF) { usize = riU64(dv, q); q += 8; }
          if (csize === 0xFFFFFFFF) { csize = riU64(dv, q); q += 8; }
          if (lho === 0xFFFFFFFF) { lho = riU64(dv, q); }
        }
        x += 4 + sz;
      }
      if (!/\/$/.test(name)) out.push({ name: name, method: method, csize: csize, usize: usize, lho: lho });
      p = xe + cl;
    }
    return out;
  });
}

function riInflate(u8, format) {
  if (typeof DecompressionStream === "undefined") return Promise.reject(new Error("nodecomp"));
  var ds = new DecompressionStream(format);
  var stream = new Blob([u8]).stream().pipeThrough(ds);
  return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
}

/* contenuto di una voce dello zip (stored o deflate) */
function riZipRead(src, en) {
  return src.slice(en.lho, en.lho + 30).arrayBuffer().then(function (ab) {
    var dv = new DataView(ab);
    if (dv.getUint32(0, true) !== 0x04034b50) throw new Error("zip");
    var start = en.lho + 30 + dv.getUint16(26, true) + dv.getUint16(28, true);
    return src.slice(start, start + en.csize).arrayBuffer();
  }).then(function (ab) {
    var u8 = new Uint8Array(ab);
    if (en.method === 0) return u8;
    if (en.method === 8) return riInflate(u8, "deflate-raw");
    throw new Error("zip-method-" + en.method);
  });
}

/* -------------------------------------------------- tutti i giri dai file */
/* Chiama onRide(name, fmt, u8) per ogni giro trovato: file singoli, .gz, zip, zip negli zip.
   Sequenziale (un giro alla volta in memoria). onStep() tra un file e l'altro per la UI. */
function riWalk(files, onRide, onStep) {
  var queue = files.map(function (f) { return { name: f.name, blob: f }; });
  function nextItem() {
    if (!queue.length) return Promise.resolve();
    var it = queue.shift(), k = riKind(it.name);
    var step = (!k ? Promise.resolve()
      : k.fmt === "zip" && !k.gz ? riZipList(it.blob).then(function (list) {
          var ents = list.filter(function (e) { return riKind(e.name); });
          var chain = Promise.resolve();
          ents.forEach(function (e) {
            chain = chain.then(function () {
              var ek = riKind(e.name);
              if (ek.fmt === "zip" && !ek.gz)        // zip annidato (export Garmin): lo leggo intero e lo accodo
                return riZipRead(it.blob, e).then(function (u8) { queue.unshift({ name: e.name, blob: new Blob([u8]) }); });
              return riZipRead(it.blob, e).then(function (u8) { return riGot(e.name, ek, u8); }).then(onStep, onStep);
            });
          });
          return chain;
        })
      : it.blob.arrayBuffer().then(function (ab) { return riGot(it.name, k, new Uint8Array(ab)); }));
    return step.then(onStep, onStep).then(nextItem);
  }
  function riGot(name, k, u8) {
    return (k.gz ? riInflate(u8, "gzip") : Promise.resolve(u8)).then(function (raw) { return onRide(name, k.fmt, raw); });
  }
  return nextItem();
}

/* ----------------------------------------------------------------- UI */
function riHandleFiles(files) {
  if (!files || !files.length || RI.busy) return;
  var passesReady = (typeof osmFullPending !== "undefined" && osmFullPending && osmFullPending.then) ? osmFullPending : Promise.resolve();
  var single = files.length === 1 && riKind(files[0].name) && riKind(files[0].name).fmt !== "zip";
  if (typeof lrcModal === "function") lrcModal("<h3>" + riT("Analizzo i giri...", "Analysing rides...") + '</h3><p class="lrc-sub" id="ri-prog"></p>');
  passesReady.then(function () {}, function () {}).then(function () {
    var passes = gcAllPasses();
    if (single) {                                    // un giro: la scheda di sempre, con i tempi
      var f = files[0], k = riKind(f.name);
      return f.arrayBuffer().then(function (ab) { return k.gz ? riInflate(new Uint8Array(ab), "gzip") : new Uint8Array(ab); }).then(function (u8) {
        var pr = riPoints(k.fmt, u8), res = pr.err ? { err: "few" } : gcAnalyzePts(pr.pts, passes, pr.date);
        res.src = k.fmt; gcShow(res, f.name);
      });
    }
    RI.busy = true;
    var st = { rides: 0, timed: 0, bad: 0, climbs: 0, unknown: 0, ens: [], seen: {} };
    var tick = 0;
    function prog() {
      var el = document.getElementById("ri-prog");
      if (el) el.textContent = st.rides + " " + riT("giri letti", "rides read") + " \u00b7 " + st.climbs + " " + riT("salite note trovate", "known climbs found");
      return (++tick % 10) ? null : new Promise(function (r) { setTimeout(r, 0); });  // lascia respirare la pagina
    }
    return riWalk(files, function (name, fmt, u8) {
      var pr = riPoints(fmt, u8);
      if (pr.err || !pr.pts || pr.pts.length < 20) { st.bad++; return; }
      var res = gcAnalyzePts(pr.pts, passes, pr.date);
      if (res.err) { st.bad++; return; }
      st.rides++; if (res.timed) st.timed++;
      res.src = fmt;
      res.climbs.forEach(function (c) { if (c.match && c.match.pass) st.climbs++; else st.unknown++; });
      mcEntriesFrom(res).forEach(function (en) {
        var key = en.passId + "|" + (en.start || en.date + "|" + en.side);   // stesso giro in due formati: una volta sola
        if (!st.seen[key]) { st.seen[key] = 1; st.ens.push(en); }
      });
    }, prog).then(function () { RI.busy = false; RI.last = st; riSummary(st); });
  }).catch(function (e) {
    RI.busy = false;
    lrcModal("<h3>" + riT("Non riesco a leggere i file", "Can't read the files") + '</h3><p class="lrc-msg lrc-err">'
      + gcEsc(e && e.message === "nodecomp" ? riT("Il browser non sa decomprimere: aggiornalo o usa Chrome, Edge, Firefox o Safari recenti.", "This browser can't decompress: update it or use a recent Chrome, Edge, Firefox or Safari.") : (e && e.message ? e.message : e))
      + '</p><div class="lrc-btns"><button onclick="lrcClose()">' + riT("Chiudi", "Close") + "</button></div>");
  });
}

function riSummary(st) {
  var passes = {}, n = 0;
  st.ens.forEach(function (en) { if (!passes[en.passId]) { passes[en.passId] = 1; n++; } });
  var h = "<h3>" + riT("I tuoi giri", "Your rides") + "</h3>"
    + '<div class="lrc-facts">'
    + "<div>" + riT("Giri", "Rides") + "<b>" + st.rides + "</b></div>"
    + "<div>" + riT("Salite note", "Known climbs") + "<b>" + n + "</b></div>"
    + "<div>" + riT("Passaggi", "Efforts") + "<b>" + st.ens.length + "</b></div>"
    + "<div>" + riT("Con i tempi", "Timed") + "<b>" + st.timed + "</b></div></div>"
    + '<p class="lrc-sub">' + riT("I file restano sul tuo dispositivo: si salvano solo le salite note, con data, versante e tempi.", "Files stay on your device: only known climbs are saved, with date, side and times.")
    + (st.unknown ? " " + st.unknown + " " + riT("salite non sono ancora in LocaRide: caricando il singolo giro puoi proporle.", "climbs aren't in LocaRide yet: load that single ride to suggest them.") : "")
    + (st.bad ? " " + st.bad + " " + riT("file senza traccia o quote, saltati.", "files without track or elevation, skipped.") : "") + "</p>"
    + '<div class="lrc-btns"><button onclick="lrcClose()">' + riT("Chiudi", "Close") + "</button>"
    + (st.ens.length ? '<button class="lrc-go" id="ri-save" onclick="riSave()">&#x2705; ' + riT("Salva in Le mie salite", "Save to My climbs") + " (" + n + ")</button>" : "")
    + '</div><div class="lrc-msg" id="ri-msg"></div>';
  lrcModal(h);
}

function riSave() {
  var st = RI.last; if (!st || !st.ens.length) return;
  var msg = document.getElementById("ri-msg"), btn = document.getElementById("ri-save");
  if (btn) btn.disabled = true;
  mcSaveEntries(st.ens, function (d, t) { if (msg) { msg.className = "lrc-msg"; msg.textContent = d + " / " + t; } }).then(function (n) {
    if (msg) { msg.className = "lrc-msg lrc-ok"; msg.innerHTML = n + " " + riT("salite salvate. Le trovi in <b>Le mie salite</b>.", "climbs saved. You'll find them in <b>My climbs</b>."); }
  }).catch(function (e) {
    if (btn) btn.disabled = false;
    if (msg) { msg.className = "lrc-msg lrc-err"; msg.textContent = (e && e.message ? e.message : String(e)); }
  });
}

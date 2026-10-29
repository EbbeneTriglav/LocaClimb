/* classic-bridge.js - lets the classic app's ride importer (js/gpxclimbs.js, js/myclimbs.js,
 * js/rideimport.js: GPX, FIT, TCX, .gz, full Strava/Garmin export zips) run inside v2 unchanged.
 * It provides the few helpers those modules take from js/contribute.js and the classic map
 * (lrcModal, lrcUser, openD...), drawn in v2's dialog. v2/app.mjs fills PASSES_DATA / osmPasses
 * with the merged climbs after loading the index. Classic script, ES5, loaded before them.
 */
var LRC_V2 = { onSaved: null };
function lrcT(it) { return it; }
function lrcEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function lrcUser() { try { return window.firebase && firebase.apps.length ? firebase.auth().currentUser : null; } catch (e) { return null; } }
function lrcDb() { try { return window.firebase && firebase.apps.length ? firebase.firestore() : null; } catch (e) { return null; } }
function lrcModal(html) {
  var d = document.getElementById("dlg"); if (!d) return;
  d.innerHTML = '<div class="dform lrc"><div class="dh"><span></span><button type="button" class="ib" onclick="lrcClose()" aria-label="Chiudi">&#x2715;</button></div>' + html + "</div>";
  if (!d.open) d.showModal();
}
function lrcClose() { var d = document.getElementById("dlg"); if (d && d.open) d.close(); if (LRC_V2.onSaved) LRC_V2.onSaved(); }
function lrcFindMenus() { return {}; }                     // v2 has its own buttons: no classic menus to wire
function lrcMenuItem() { return document.createElement("span"); }
/* links of the importer -> v2 routes */
function openD(id) { location.hash = "#/s/" + encodeURIComponent(id); }
function openOsmD(id) { openD(id); }
var osmPasses = [];

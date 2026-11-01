/* lrcact.js - the buttons that the ride importer (gpxclimbs.js, myclimbs.js, rideimport.js) and
 * v2's dialog (classic-bridge.js) build as HTML strings call their action through
 * data-lrc="name" (+ data-i="n") instead of an inline onclick: the Content-Security-Policy of the
 * main page blocks inline handlers (01/11/2026). Only the functions listed in LRC_ACTS can be
 * called, so a data-lrc attribute that slips into user content cannot run anything else.
 * Classic script, ES5, loaded in both apps before the modules that use it.
 */
var LRC_ACTS = { lrcClose: 1, gcOpen: 1, gcPropose: 1, gcPreview: 1, gcDraw: 1, gcShow: 1, gcPick: 1, mcSaveFromGpx: 1, mcOpen: 1, mcDel: 1, riSave: 1 };
function lrcRun(names, arg) {
  String(names || "").split(" ").forEach(function (n) {
    if (!LRC_ACTS[n] || typeof window[n] !== "function") return;
    if (n === "gcShow") window[n](window.GC_LAST);          // "back to the list" of the last ride
    else if (arg != null && arg !== "") window[n](+arg);
    else window[n]();
  });
}
document.addEventListener("click", function (e) {
  var b = e.target && e.target.closest ? e.target.closest("[data-lrc]") : null;
  if (!b) return;
  lrcRun(b.getAttribute("data-lrc"), b.getAttribute("data-i"));
});

/* Central event delegation. Replaces the inline on*="fn(args)" attributes that used to be
   scattered through index.html and every innerHTML builder - which forced all ~170 handler
   functions to be window globals and blocked a tighter CSP (no more inline-handler
   execution). Each interactive element now carries data-act="<action>" (click) or
   data-change="<action>" (change), plus any data-* args; ACTIONS maps the action name to the
   real call.

   The listeners are registered in the CAPTURE phase on purpose: clicks inside Leaflet popups
   (the openD/addToRoute "Dettagli"/"+ Route" buttons) are stopPropagation()'d by Leaflet in
   the bubble phase, so bubble-phase delegation would never see them - capture fires top-down
   from document before Leaflet can swallow the event. */
var ACTIONS = {
  // toolbar / panels (static markup in index.html)
  mapHome: function () { map.setView([45.8, 10.5], 7); },
  toggleFount: function () { toggleFount(); },
  applyFilters: function () { applyFilters(); },
  resetFilters: function () { resetFilters(); },
  closeFP: function () { closeFP(); },
  calcRoute: function () { calcRoute(); },
  downloadGPX: function () { downloadGPX(); },
  downloadGPXRich: function () { downloadGPXRich(); },
  pickGpx: function () { pickGPX(); },
  gpxFile: function (el) { onGpxPicked(el); },
  resetRoute: function () { resetRoute(); },
  loadRideWeather: function () { loadRideWeather(); },
  toggleRwStops: function () { toggleRwStops(); },
  rwBufChanged: function () { rwBufChanged(); },
  toggleWindArrows: function () { toggleWindArrows(); },
  submitReport: function () { submitReport(); },
  closeModal: function () { closeModal(); },
  toggleBE: function () { toggleBE(); },
  // map markers / popups + search results
  openD: function (el) { openD(el.getAttribute("data-id")); },
  addToRoute: function (el) { addToRoute(el.getAttribute("data-id")); },
  openOsmD: function (el) { openOsmD(el.getAttribute("data-id")); },
  addOsmToRoute: function (el) { addOsmToRoute(el.getAttribute("data-id")); },
  pickSearch: function (el) { pickSearch(+el.getAttribute("data-i")); },
  // detail panel
  closeD: function () { closeD(); },
  setElev: function (el) { setElev(+el.getAttribute("data-i")); },
  exportGPX: function (el) { exportGPX(el.getAttribute("data-id"), +el.getAttribute("data-i")); },
  openReport: function (el) { openReport(el.getAttribute("data-id")); },
  // route builder list
  moveStop: function (el) { moveStop(+el.getAttribute("data-i"), +el.getAttribute("data-dir")); },
  removeFromRoute: function (el) { removeFromRoute(+el.getAttribute("data-i")); },
  // account / community ratings
  amLogin: function () { amLogin(); },
  amSignup: function () { amSignup(); },
  amGoogle: function () { amGoogle(); },
  submitVote: function (el) { submitVote(el.getAttribute("data-id")); },
  fbResend: function () { fbResend(); return false; }, // <a> link: false -> preventDefault
  acctOpen: function () { acctOpen(); }
};
function dispatchAction(attr, e) {
  var el = e.target && e.target.closest && e.target.closest("[" + attr + "]");
  if (!el) return;
  var fn = ACTIONS[el.getAttribute(attr)];
  if (!fn) return;
  if (fn(el, e) === false && e.preventDefault) e.preventDefault();
}
function wireActions() {
  document.addEventListener("click", function (e) { dispatchAction("data-act", e); }, true);
  document.addEventListener("change", function (e) { dispatchAction("data-change", e); }, true);
}

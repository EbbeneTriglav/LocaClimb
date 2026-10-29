/*
 * diary.mjs - "Le tue salite": the climbs the rider actually did (users/{uid}/climbs, written by
 * the classic app from GPX/FIT/zip imports - js/myclimbs.js). Same origin as the classic app, so
 * the Firebase session is shared: signed in there = signed in here.
 * Uses the firebase "compat" globals loaded by v2/index.html (same versions as the classic app).
 */
const FIREBASE_CONFIG = { apiKey: "AIzaSyB96EFYEWv1fvWdsHScZA_VCJiQcud7sAg", authDomain: "locaride-ce1ad.firebaseapp.com", projectId: "locaride-ce1ad", storageBucket: "locaride-ce1ad.firebasestorage.app", messagingSenderId: "723776991350", appId: "1:723776991350:web:21b21900ab15ada61c2f57" };
let fb = null;

function init() {
  if (fb) return fb;
  const f = globalThis.firebase;
  if (!f) return null;
  try { if (!f.apps.length) f.initializeApp(FIREBASE_CONFIG); fb = { auth: f.auth(), db: f.firestore(), f }; } catch { return null; }
  return fb;
}

/* resolves with the current user (or null) once Firebase has restored the session */
export function currentUser() {
  const x = init();
  if (!x) return Promise.resolve(null);
  return new Promise((res) => { const off = x.auth.onAuthStateChanged((u) => { off(); res(u); }); });
}

export async function signIn() {
  const x = init();
  if (!x) throw new Error("Accesso non disponibile");
  const prov = new x.f.auth.GoogleAuthProvider();
  try { return (await x.auth.signInWithPopup(prov)).user; }
  catch (e) {
    if (e && /popup/.test(e.code || "")) { await x.auth.signInWithRedirect(prov); return null; }
    throw e;
  }
}

export async function loadClimbs(uid) {
  const x = init();
  const qs = await x.db.collection("users").doc(uid).collection("climbs").get();
  const out = [];
  qs.forEach((d) => out.push({ ...d.data(), _doc: d.id }));
  return out;
}

/* pure: totals for the header */
export function diaryStats(list) {
  let efforts = 0, top = null, gain = 0;
  for (const d of list) {
    efforts += (d.efforts && d.efforts.length) || (d.dates || []).length;
    if (!top || (d.elevation || 0) > (top.elevation || 0)) top = d;
    gain += ((d.best && d.best.gain) || 0) * ((d.dates || []).length || 1);
  }
  return { climbs: list.length, efforts, top, gain: Math.round(gain) };
}

/* pure: best time of a climb across its sides -> { side, sec, date } | null */
export function bestOf(d) {
  const bt = d && d.bestTime;
  if (!bt) return null;
  let best = null;
  for (const [side, b] of Object.entries(bt)) {
    const t = b.moving || b.sec;
    if (t > 0 && (!best || t < best.sec)) best = { side, sec: t, date: b.date };
  }
  return best;
}

export function dur(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60, p = (x) => String(x).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

/* community ratings of a climb (ratings/{id}, written by the classic app): averages 1..5 */
export async function loadRatings(id) {
  const x = init();
  if (!x) return null;
  const d = await x.db.collection("ratings").doc(String(id)).get();
  return ratingSummary(d.exists ? d.data() : null);
}
export function ratingSummary(a) {
  const n = (a && a.n) || 0, av = (s) => (n ? (a[s] || 0) / n : 0);
  const axes = [["Emozione", av("eSum")], ["Paesaggio", av("pSum")], ["Traffico", av("tSum")], ["Asfalto", av("aSum")]];
  return { n, overall: n ? axes.reduce((t, x) => t + x[1], 0) / 4 : 0, axes };
}

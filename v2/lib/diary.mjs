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

/* ---------------------------------------------------------------- account (as the classic app) */
export async function signInEmail(email, pw) { const x = init(); if (!x) throw new Error("Accesso non disponibile"); return (await x.auth.signInWithEmailAndPassword(email, pw)).user; }
export async function signUpEmail(email, pw, name) {
  const x = init(); if (!x) throw new Error("Accesso non disponibile");
  const cr = await x.auth.createUserWithEmailAndPassword(email, pw);
  if (name) await cr.user.updateProfile({ displayName: name }).catch(() => {});
  await cr.user.sendEmailVerification().catch(() => {});
  return cr.user;
}
export async function resetPassword(email) { const x = init(); if (!x) throw new Error("Accesso non disponibile"); await x.auth.sendPasswordResetEmail(email); }
export async function signOut() { const x = init(); if (x) await x.auth.signOut(); }
/* Firebase error -> Italian sentence (the codes the classic app handles too) */
export function authError(e) {
  const c = (e && e.code) || "";
  return ({ "auth/invalid-email": "Indirizzo email non valido.", "auth/user-not-found": "Nessun account con questa email.",
    "auth/wrong-password": "Password sbagliata.", "auth/invalid-credential": "Email o password sbagliate.",
    "auth/email-already-in-use": "Esiste già un account con questa email: accedi.", "auth/weak-password": "Password troppo corta: almeno 6 caratteri.",
    "auth/too-many-requests": "Troppi tentativi: riprova tra qualche minuto.", "auth/popup-closed-by-user": "Finestra di accesso chiusa." })[c]
    || (e && e.message) || "Accesso non riuscito.";
}

/* ---------------------------------------------------------------- votes and comments */
export const REV_MAX = 300;
/* same documents and transaction as js/reviews.js: ratings/{id} keeps the sums, votes/{uid} the vote */
export async function submitVote(pid, passName, v, user) {
  const x = init(); if (!x || !user) throw new Error("Accedi per votare");
  const txt = String(v.txt || "").trim().slice(0, REV_MAX);
  const passRef = x.db.collection("ratings").doc(String(pid)), voteRef = passRef.collection("votes").doc(user.uid);
  await x.db.runTransaction(async (tx) => {
    const vs = await tx.get(voteRef), ps = await tx.get(passRef);
    const agg = ps.exists ? ps.data() : { n: 0, eSum: 0, pSum: 0, tSum: 0, aSum: 0 }, old = vs.exists ? vs.data() : null;
    if (old) { agg.eSum -= old.e; agg.pSum -= old.p; agg.tSum -= old.t; agg.aSum -= old.a; agg.n -= 1; }
    agg.eSum += v.e; agg.pSum += v.p; agg.tSum += v.t; agg.aSum += v.a; agg.n += 1;
    tx.set(passRef, agg);
    tx.set(voteRef, { e: v.e, p: v.p, t: v.t, a: v.a, txt, by: user.displayName || "", ts: Date.now() });
  });
  x.db.collection("users").doc(user.uid).collection("reviews").doc(String(pid))
    .set({ passId: String(pid), passName, txt, e: v.e, p: v.p, t: v.t, a: v.a, ts: Date.now() }).catch(() => {});
}
export async function myVote(pid, user) {
  const x = init(); if (!x || !user) return null;
  const d = await x.db.collection("ratings").doc(String(pid)).collection("votes").doc(user.uid).get();
  return d.exists ? d.data() : null;
}
export async function recentComments(pid, n = 5) {
  const x = init(); if (!x) return [];
  const qs = await x.db.collection("ratings").doc(String(pid)).collection("votes").orderBy("ts", "desc").limit(20).get();
  const out = []; qs.forEach((d) => { const o = d.data(); if (o.txt) out.push(o); });
  return out.slice(0, n);
}

/* ---------------------------------------------------------------- reports ("segnala") */
/* Writes reports/{auto}: the classic app's "Segnala informazione" never sent anything.
   Needs the reports block of firestore.rules (published by Rick in the Firebase console). */
export async function sendReport(pid, passName, kind, text, user) {
  const x = init(); if (!x || !user) throw new Error("Accedi per segnalare");
  const t = String(text || "").trim().slice(0, 1000);
  if (t.length < 5) throw new Error("Scrivi cosa non va (almeno qualche parola).");
  await x.db.collection("reports").add({ passId: String(pid), passName: String(passName || ""), kind: String(kind || "altro"), text: t, uid: user.uid, by: user.displayName || user.email || "", ts: Date.now(), status: "new", app: "v2" });
}

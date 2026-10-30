/*
 * Firestore rules check, on the official emulator (NOT part of "node --test test/*.test.mjs":
 * it needs Java and the Firestore emulator).
 *
 *   npm i --no-save firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10
 *   npx firebase emulators:exec --only firestore --project demo-locaride "node test/firestore-rules.emu.mjs"
 *
 * with a firebase.json like {"firestore":{"rules":"firestore.rules"},"emulators":{"firestore":{"port":8085}}}.
 * Every case must print "ok"; exit code 1 otherwise.
 */
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDoc, addDoc, collection, updateDoc, deleteDoc } from "firebase/firestore";
const env = await initializeTestEnvironment({ projectId: "demo-locaride", firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8085 } });
await env.withSecurityRulesDisabled(async (c) => { const db = c.firestore(); await setDoc(doc(db, "users/rick"), { role: "admin" }); await setDoc(doc(db, "users/tester"), { canPropose: true }); await setDoc(doc(db, "reports/r1"), { passId: "x", status: "new", uid: "anna" }); });
const anna = env.authenticatedContext("anna", { email_verified: true }).firestore();
const unver = env.authenticatedContext("bob", { email_verified: false }).firestore();
const rick = env.authenticatedContext("rick", { email_verified: true }).firestore();
const tester = env.authenticatedContext("tester", { email_verified: true }).firestore();
const anon = env.unauthenticatedContext().firestore();
const rep = (uid, extra = {}) => ({ passId: "mortirolo", passName: "Passo del Mortirolo", kind: "tracciato", text: "Da Mazzo passa da Grosio", uid, by: "Anna", ts: Date.now(), status: "new", app: "v2", ...extra });
let ok = 0, ko = 0;
const t = async (name, p) => { try { await p; ok++; console.log("ok  ", name); } catch (e) { ko++; console.log("FAIL", name, String(e).slice(0, 120)); } };
// reports
await t("report: v2 payload by signed-in user", assertSucceeds(addDoc(collection(anna, "reports"), rep("anna"))));
await t("report: also unverified email user", assertSucceeds(addDoc(collection(unver, "reports"), rep("bob"))));
await t("report: anonymous refused", assertFails(addDoc(collection(anon, "reports"), rep("anna"))));
await t("report: in someone else's name refused", assertFails(addDoc(collection(anna, "reports"), rep("rick"))));
await t("report: born closed refused", assertFails(addDoc(collection(anna, "reports"), rep("anna", { status: "done" }))));
await t("report: text too short refused", assertFails(addDoc(collection(anna, "reports"), rep("anna", { text: "no" }))));
await t("report: text too long refused", assertFails(addDoc(collection(anna, "reports"), rep("anna", { text: "x".repeat(1001) }))));
await t("report: extra field refused", assertFails(addDoc(collection(anna, "reports"), rep("anna", { role: "admin" }))));
await t("report: author cannot read", assertFails(getDoc(doc(anna, "reports/r1"))));
await t("report: author cannot edit", assertFails(updateDoc(doc(anna, "reports/r1"), { status: "done" })));
await t("report: admin reads", assertSucceeds(getDoc(doc(rick, "reports/r1"))));
await t("report: admin closes", assertSucceeds(updateDoc(doc(rick, "reports/r1"), { status: "done" })));
await t("report: admin deletes", assertSucceeds(deleteDoc(doc(rick, "reports/r1"))));
// unchanged parts still behave
await t("users: cannot make himself admin", assertFails(setDoc(doc(anna, "users/anna"), { role: "admin" })));
await t("users: own profile ok (create)", assertSucceeds(setDoc(doc(anna, "users/anna"), { name: "Anna" })));
await t("users: cannot add role later", assertFails(updateDoc(doc(anna, "users/anna"), { role: "admin" })));
await t("users: cannot add canPropose later", assertFails(setDoc(doc(anna, "users/anna"), { name: "Anna", canPropose: true })));
await t("users: profile update ok", assertSucceeds(updateDoc(doc(anna, "users/anna"), { name: "Anna B." })));
await t("users: own climbs ok", assertSucceeds(setDoc(doc(anna, "users/anna/climbs/stelvio"), { n: 1 })));
await t("users: own reviews ok", assertSucceeds(setDoc(doc(anna, "users/anna/reviews/stelvio"), { txt: "bella" })));
await t("users: others' subcollections refused", assertFails(getDoc(doc(anna, "users/rick/climbs/x"))));
await t("users: others' data refused", assertFails(getDoc(doc(anna, "users/rick"))));
await t("ratings: verified vote ok", assertSucceeds(setDoc(doc(anna, "ratings/stelvio/votes/anna"), { e: 5 })));
await t("ratings: unverified vote refused", assertFails(setDoc(doc(unver, "ratings/stelvio/votes/bob"), { e: 5 })));
await t("ratings: public read", assertSucceeds(getDoc(doc(anon, "ratings/stelvio"))));
await t("proposals: tester pending ok", assertSucceeds(setDoc(doc(tester, "proposals/p1"), { uid: "tester", status: "pending", name: "Salita test", flat: [1, 2], km: 5 })));
await t("proposals: not a tester refused", assertFails(setDoc(doc(anna, "proposals/p2"), { uid: "anna", status: "pending", name: "Salita test", flat: [1, 2], km: 5 })));
await t("shared: public read", assertSucceeds(getDoc(doc(anon, "shared/x"))));
await t("shared: verified owner creates", assertSucceeds(setDoc(doc(anna, "shared/s1"), { owner: "anna" })));
await t("shared: someone else's name refused", assertFails(setDoc(doc(anna, "shared/s2"), { owner: "rick" })));
await t("proposals: approve by tester refused", assertFails(updateDoc(doc(tester, "proposals/p1"), { status: "approved" })));
await t("proposals: admin approves", assertSucceeds(updateDoc(doc(rick, "proposals/p1"), { status: "approved" })));
await t("proposals: approved is public", assertSucceeds(getDoc(doc(anon, "proposals/p1"))));
await env.cleanup();
console.log(`\n${ok} ok, ${ko} failed`);
process.exit(ko ? 1 : 0);

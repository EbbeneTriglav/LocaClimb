/*
 * LocaRide - Cloudflare Worker (runs only for /__/* thanks to run_worker_first).
 *
 * Firebase Auth reverse proxy, "option 3" of Firebase's guide "Best practices for using
 * signInWithRedirect on browsers that block third-party storage".
 * With authDomain = "locaride.app" the auth handler is served from our own origin, so the
 * redirect result is not lost when the browser partitions third-party storage.
 * Everything that is not /__/auth or /__/firebase goes back to the static assets.
 */
const FIREBASE_HOST = "locaride-ce1ad.firebaseapp.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/__/auth/") || url.pathname.startsWith("/__/firebase/")) {
      const target = new URL(url.pathname + url.search, "https://" + FIREBASE_HOST);
      // keep method, headers, body; do not follow redirects here (the browser must see them)
      return fetch(new Request(target, request), { redirect: "manual" });
    }
    return env.ASSETS.fetch(request);
  }
};

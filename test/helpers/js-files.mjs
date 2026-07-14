/*
 * The js/*.js files in the exact order index.html <script src>-tags them (state/utils/
 * data first = constants + pure helpers; init.js last = DOMContentLoaded wiring). Shared
 * by both test harnesses: load-app.mjs (vm, pure-logic tests) and render-app.mjs (jsdom,
 * DOM/rendering tests). Add a new js/*.js file here - in its <script src> order - when you
 * add its tag to index.html, or it won't be visible to either harness.
 */
export const JS_FILES = ["state", "utils", "data", "map", "panel", "routebuilder", "rideweather", "editor", "auth", "events", "init"];

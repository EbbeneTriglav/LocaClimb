/*
 * Event-delegation coverage for js/events.js - the replacement for the inline on*="..."
 * handlers. Proves the capture-phase document listener actually dispatches a data-act click
 * to the right function (arg-less) AND parses/threads a data-i argument, driven end-to-end in
 * jsdom against a real rendered panel. This is what makes the handler-removal safe: nothing
 * else catches a broken data-act name, a missing data-* arg, or an unwired listener.
 *
 * Needs jsdom (`npm install jsdom --no-save`); skips cleanly if it's absent.
 */
import test from "node:test";
import assert from "node:assert/strict";

let renderApp;
try {
  ({ renderApp } = await import("./helpers/render-app.mjs"));
} catch {
  test("event delegation (jsdom)", { skip: "jsdom not installed - run `npm install jsdom --no-save`" }, () => {});
}

if (renderApp) {
  // init.js calls wireActions() on DOMContentLoaded, which the harness never fires - do it here.
  async function openPanel() {
    const win = await renderApp();
    win.wireActions();
    const p = win.PASSES_DATA.find((x) => x.versanti && x.versanti.length > 1);
    win.renderPassPanel(p, false);
    return win;
  }
  const click = (win, el) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));

  test("a data-act click is dispatched through the delegated listener (closeD)", async () => {
    const win = await openPanel();
    const dp = win.document.getElementById("dp");
    assert.ok(dp.classList.contains("open"), "panel starts open");

    const closeBtn = dp.querySelector('[data-act="closeD"]');
    assert.ok(closeBtn, "close control carries data-act, not an inline onclick");
    assert.equal(closeBtn.getAttribute("onclick"), null, "no residual inline handler");

    click(win, closeBtn);
    assert.equal(dp.classList.contains("open"), false, "delegated closeD closed the panel");
  });

  test("delegation parses and threads a numeric data-i argument (setElev)", async () => {
    const win = await openPanel();
    const btn = win.document.querySelector('#elev-tog [data-act="setElev"][data-i="0"]');
    assert.ok(btn, "per-versante elevation toggle rendered with data-i");

    click(win, btn);
    assert.equal(win.elevSel, 0, "setElev received the parsed data-i value via delegation");
  });

  test("clicking an element with no data-act is a harmless no-op", async () => {
    const win = await openPanel();
    const h2 = win.document.querySelector("#dp h2");
    assert.doesNotThrow(() => click(win, h2));
  });
}

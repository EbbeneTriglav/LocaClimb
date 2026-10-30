const { chromium } = require("playwright"); const fs = require("fs");
const jobs = [["brand/icon-L2-lime.svg", "apple-touch-icon.png", 180], ["brand/icon-L2-lime-maskable.svg", "icon-512-maskable.png", 512],
  ["brand/icon-L3-lime-rounded.svg", "icon-512.png", 512], ["brand/icon-L3-lime-rounded.svg", "icon-192.png", 192],
  ["favicon.svg", "fav-16.png", 16], ["favicon.svg", "fav-32.png", 32], ["favicon.svg", "fav-48.png", 48]];
(async () => { const b = await chromium.launch();
  for (const [src, out, n] of jobs) {
    const p = await b.newPage({ viewport: { width: n, height: n }, colorScheme: "light" });
    const data = "data:image/svg+xml;base64," + Buffer.from(fs.readFileSync(src)).toString("base64");
    await p.setContent(`<html><body style="margin:0;background:transparent"><img src="${data}" width="${n}" height="${n}" style="display:block"></body></html>`);
    await p.waitForTimeout(150); await p.screenshot({ path: out, omitBackground: true }); await p.close();
  }
  // preview: favicon in dark mode too
  const p = await b.newPage({ viewport: { width: 64, height: 64 }, colorScheme: "dark" });
  await p.setContent(`<html><body style="margin:0"><img src="data:image/svg+xml;base64,${Buffer.from(fs.readFileSync("out/favicon.svg")).toString("base64")}" width="64" height="64"></body></html>`);
  await p.waitForTimeout(150); await p.screenshot({ path: "fav-dark-64.png", omitBackground: true });
  await b.close(); })();

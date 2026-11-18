#!/usr/bin/env node
/*
 * serve.mjs - zero-dependency static file server for local testing.
 * Serves the repo root (where index.html lives) over plain HTTP so fetch()
 * calls to the *.json data files work (opening index.html via file:// breaks them).
 * Usage: node scripts/serve.mjs [port]   (default port 8000)
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleTransit } from "../cf/transit.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = parseInt(process.argv[2] || process.env.PORT || "8000", 10);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = createServer(async (req, res) => {
  try {
    let reqPath = decodeURIComponent(req.url.split("?")[0]);
    // /api/transit/*: the Worker's handler (cf/transit.js) runs here too, so the Giro's trains work locally
    // (no cache, no HERE key: Transitous only)
    if (reqPath.startsWith("/api/transit/")) {
      const r = await handleTransit(new Request("http://localhost:" + PORT + req.url), {}, null);
      res.writeHead(r.status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" });
      res.end(await r.text());
      return;
    }
    if (reqPath.endsWith("/")) reqPath += "index.html";   // like Cloudflare/Pages: /classica/ -> /classica/index.html
    const filePath = path.normalize(path.join(ROOT, reqPath));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end("Forbidden"); return; }

    const st = await stat(filePath).catch(() => null);
    if (!st || !st.isFile()) { res.writeHead(404); res.end("Not found"); return; }

    const body = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(body);
  } catch (e) {
    res.writeHead(500);
    res.end("Server error: " + e.message);
  }
});

server.listen(PORT, () => {
  console.log("locaClimb dev server running at http://localhost:" + PORT + "/");
  console.log("Serving " + ROOT + " (Ctrl+C to stop)");
});
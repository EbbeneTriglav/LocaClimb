#!/usr/bin/env node
/*
 * save-api.mjs - optional VPS-hosted alternative to the in-app editor's client-side
 * "Salva diretto (admin)" GitHub flow (js/editor.js's ghSave(), still fully intact and
 * usable as-is for anyone deploying to GitHub Pages). Instead of the browser holding a
 * GitHub fine-grained token in
 * sessionStorage and calling api.github.com directly, this server holds the token
 * server-side and the browser only ever sends a shared admin passphrase to *this*
 * server. Both save paths can coexist - which one a given maintainer uses just
 * depends on whether they configure VPS_API_CONFIG.endpoint in js/state.js.
 *
 * Env vars (all required to actually start, see main()):
 *   GITHUB_TOKEN   - fine-grained PAT, Contents: read & write, scoped to one repo
 *   GITHUB_OWNER   - e.g. "EbbeneTriglav"
 *   GITHUB_REPO    - e.g. "LocaClimb"
 *   ADMIN_KEY      - shared passphrase the editor UI must send as X-Admin-Key
 * Optional:
 *   PORT            - default 8787
 *   ALLOWED_ORIGIN  - CORS origin to allow, default "*"
 *   GITHUB_BRANCH   - default "main"
 *
 * Run: node server/save-api.mjs
 * Deploying it long-term (systemd unit, reverse proxy/TLS) is a VPS-specific step
 * outside this repo's control - see deploy/systemd/README.md for templates.
 */
import { createServer } from "node:http";
import { validateManualOverrides } from "../scripts/validate_data.mjs";

export function checkAdminKey(headerValue, expected) {
  return !!(typeof headerValue === "string" && expected && headerValue === expected);
}

export function buildGithubPutBody({ message, contentObj, sha, branch }) {
  const json = JSON.stringify(contentObj, null, 1) + "\n";
  const body = {
    message,
    content: Buffer.from(json, "utf8").toString("base64"),
    branch
  };
  if (sha) body.sha = sha;
  return body;
}

// fetchImpl is injectable so tests can run this without a real network/GitHub call.
export async function commitManualOverrides({ owner, repo, token, branch, contentObj, fetchImpl = fetch }) {
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/data/manual_overrides.json`;
  const headers = { Authorization: "token " + token, Accept: "application/vnd.github+json" };

  const curRes = await fetchImpl(api + `?ref=${branch}`, { headers });
  const cur = curRes.ok ? await curRes.json() : null;

  const body = buildGithubPutBody({
    message: "data: edit manual climbs (VPS save-api)",
    contentObj,
    sha: cur && cur.sha,
    branch
  });

  const putRes = await fetchImpl(api, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const putJson = await putRes.json().catch(() => ({}));
  if (!putRes.ok) throw new Error((putJson && putJson.message) || `GitHub PUT failed with ${putRes.status}`);
  return putJson;
}

// Pure request handler: given a parsed body + headers + config, decide the HTTP
// response - no node:http types involved, so it's directly unit-testable.
export async function handleSaveRequest({ headers, body, config, fetchImpl }) {
  if (!checkAdminKey(headers["x-admin-key"], config.adminKey)) {
    return { status: 401, json: { ok: false, error: "Invalid or missing X-Admin-Key" } };
  }
  let payload;
  try {
    payload = typeof body === "string" ? JSON.parse(body) : body;
  } catch (e) {
    return { status: 400, json: { ok: false, error: "Body is not valid JSON" } };
  }
  const errors = validateManualOverrides(payload, "manual_overrides.json");
  if (errors.length > 0) {
    return { status: 400, json: { ok: false, error: "Validation failed", details: errors } };
  }
  try {
    const result = await commitManualOverrides({
      owner: config.owner, repo: config.repo, token: config.token,
      branch: config.branch, contentObj: payload, fetchImpl
    });
    return { status: 200, json: { ok: true, commit: result.commit && result.commit.sha } };
  } catch (e) {
    return { status: 502, json: { ok: false, error: e.message } };
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; if (data.length > 5_000_000) req.destroy(); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export function createApiServer(config) {
  return createServer(async (req, res) => {
    const cors = {
      "Access-Control-Allow-Origin": config.allowedOrigin,
      "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
    };
    if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === "POST" && req.url === "/api/manual-overrides") {
      const body = await readBody(req);
      const result = await handleSaveRequest({ headers: req.headers, body, config });
      res.writeHead(result.status, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify(result.json));
      return;
    }
    res.writeHead(404, cors);
    res.end(JSON.stringify({ ok: false, error: "Not found" }));
  });
}

function main() {
  const config = {
    port: parseInt(process.env.PORT || "8787", 10),
    token: process.env.GITHUB_TOKEN,
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    adminKey: process.env.ADMIN_KEY,
    branch: process.env.GITHUB_BRANCH || "main",
    allowedOrigin: process.env.ALLOWED_ORIGIN || "*"
  };
  const missing = ["token", "owner", "repo", "adminKey"].filter((k) => !config[k]);
  if (missing.length) {
    console.error("Missing required env var(s): " + missing.map((k) => ({ token: "GITHUB_TOKEN", owner: "GITHUB_OWNER", repo: "GITHUB_REPO", adminKey: "ADMIN_KEY" }[k])).join(", "));
    process.exit(1);
  }
  createApiServer(config).listen(config.port, () => {
    console.log(`save-api listening on http://localhost:${config.port} (repo: ${config.owner}/${config.repo}@${config.branch})`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) main();

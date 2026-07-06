import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAdminKey, buildGithubPutBody, commitManualOverrides, handleSaveRequest } from "../server/save-api.mjs";

const goodPayload = {
  grappa: {
    versanti: [{
      side: "Da Semonzo", startLat: 45.81, startLon: 11.77, startElevation: 196, endElevation: 1592,
      distance_km: 19.2, avgGradient: 7.3, maxGradient: 21.8, traffic: "n/d", exposure: "Sud",
      elevationProfile: [196, 500, 1000, 1592]
    }],
    updatedAt: "2026-07-01"
  }
};

test("checkAdminKey requires an exact match and rejects missing/undefined values", () => {
  assert.equal(checkAdminKey("secret", "secret"), true);
  assert.equal(checkAdminKey("wrong", "secret"), false);
  assert.equal(checkAdminKey(undefined, "secret"), false);
  assert.equal(checkAdminKey("secret", undefined), false);
});

test("buildGithubPutBody base64-encodes content and only includes sha when provided", () => {
  const body = buildGithubPutBody({ message: "m", contentObj: { a: 1 }, branch: "main" });
  assert.equal(body.message, "m");
  assert.equal(body.branch, "main");
  assert.equal("sha" in body, false);
  assert.equal(JSON.parse(Buffer.from(body.content, "base64").toString("utf8")).a, 1);

  const withSha = buildGithubPutBody({ message: "m", contentObj: { a: 1 }, branch: "main", sha: "abc123" });
  assert.equal(withSha.sha, "abc123");
});

test("commitManualOverrides fetches current sha, then PUTs with it, using the injected fetch", async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, method: opts && opts.method, headers: opts && opts.headers });
    if (!opts || !opts.method) {
      // GET current file
      return { ok: true, json: async () => ({ sha: "existing-sha" }) };
    }
    // PUT
    const body = JSON.parse(opts.body);
    assert.equal(body.sha, "existing-sha");
    return { ok: true, json: async () => ({ commit: { sha: "new-sha" } }) };
  };
  const result = await commitManualOverrides({
    owner: "o", repo: "r", token: "t", branch: "main", contentObj: goodPayload, fetchImpl: fakeFetch
  });
  assert.equal(result.commit.sha, "new-sha");
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/contents\/data\/manual_overrides\.json\?ref=main$/);
  assert.equal(calls[1].method, "PUT");
});

test("commitManualOverrides handles a brand-new file (no existing sha) and surfaces GitHub errors", async () => {
  const fakeFetch = async (url, opts) => {
    if (!opts || !opts.method) return { ok: false, json: async () => ({}) }; // file doesn't exist yet
    return { ok: false, json: async () => ({ message: "Bad credentials" }) };
  };
  await assert.rejects(
    () => commitManualOverrides({ owner: "o", repo: "r", token: "bad", branch: "main", contentObj: goodPayload, fetchImpl: fakeFetch }),
    /Bad credentials/
  );
});

test("handleSaveRequest rejects a missing/wrong admin key before touching GitHub", async () => {
  const res = await handleSaveRequest({
    headers: { "x-admin-key": "wrong" },
    body: JSON.stringify(goodPayload),
    config: { adminKey: "right" },
    fetchImpl: async () => { throw new Error("should not be called"); }
  });
  assert.equal(res.status, 401);
  assert.equal(res.json.ok, false);
});

test("handleSaveRequest rejects invalid JSON body", async () => {
  const res = await handleSaveRequest({
    headers: { "x-admin-key": "right" },
    body: "{not json",
    config: { adminKey: "right" }
  });
  assert.equal(res.status, 400);
  assert.match(res.json.error, /JSON/);
});

test("handleSaveRequest rejects a payload that fails data validation, without calling GitHub", async () => {
  const badPayload = { grappa: { versanti: [{ side: "", distance_km: -1 }] } };
  const res = await handleSaveRequest({
    headers: { "x-admin-key": "right" },
    body: JSON.stringify(badPayload),
    config: { adminKey: "right" },
    fetchImpl: async () => { throw new Error("should not be called"); }
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, "Validation failed");
  assert.ok(res.json.details.length > 0);
});

test("handleSaveRequest accepts a valid payload with the right admin key and commits it", async () => {
  const fakeFetch = async (url, opts) => {
    if (!opts || !opts.method) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ commit: { sha: "abc" } }) };
  };
  const res = await handleSaveRequest({
    headers: { "x-admin-key": "right" },
    body: JSON.stringify(goodPayload),
    config: { adminKey: "right", owner: "o", repo: "r", token: "t", branch: "main" },
    fetchImpl: fakeFetch
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.commit, "abc");
});

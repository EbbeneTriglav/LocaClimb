import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheKey, symbolToWmo, localTime, metToOpenMeteo } from "../cf/meteo.js";
import { meteoUrl } from "../v2/lib/weather.mjs";

test("cache key: same climb within ~1 km shares one upstream call", () => {
  const a = cacheKey("https://locaride.app/api/meteo?longitude=6.07185&latitude=45.09263&hourly=x");
  const b = cacheKey("https://locaride.app/api/meteo?latitude=45.0911&longitude=6.0688&hourly=x");
  assert.equal(a, b);
  assert.notEqual(a, cacheKey("https://locaride.app/api/meteo?latitude=45.12&longitude=6.07&hourly=x"));
});

test("MET symbols map to the WMO codes the app labels", () => {
  assert.equal(symbolToWmo("clearsky_day"), 0);
  assert.equal(symbolToWmo("partlycloudy_night"), 2);
  assert.equal(symbolToWmo("lightrain"), 61);
  assert.equal(symbolToWmo("heavyrainshowers_day"), 82);
  assert.equal(symbolToWmo("snow"), 73);
  assert.equal(symbolToWmo("rainandthunder"), 95);
});

test("MET answer -> Open-Meteo shape, local time, km/h, no CAPE", () => {
  assert.equal(localTime("2026-11-02T13:00:00Z", "Europe/Rome"), "2026-11-02T14:00");
  const met = { properties: { timeseries: [
    { time: "2026-11-02T13:00:00Z", data: { instant: { details: { air_temperature: 6.2, wind_speed: 5 } }, next_1_hours: { summary: { symbol_code: "lightrain" }, details: { precipitation_amount: 0.3, probability_of_precipitation: 60 } } } },
    { time: "2026-11-02T14:00:00Z", data: { instant: { details: { air_temperature: 7.1, wind_speed: 2 } }, next_1_hours: { summary: { symbol_code: "cloudy" }, details: { precipitation_amount: 0 } } } },
    { time: "2026-11-03T12:00:00Z", data: { instant: { details: { air_temperature: 9, wind_speed: 1 } }, next_6_hours: { summary: { symbol_code: "fair_day" }, details: { precipitation_amount: 0 } } } }
  ] } };
  const o = metToOpenMeteo(met, "Europe/Rome", 1);
  assert.equal(o.source, "met.no");
  assert.deepEqual(o.hourly.time, ["2026-11-02T14:00", "2026-11-02T15:00"]); // day 2 cut by days=1
  assert.deepEqual(o.hourly.wind_speed_10m, [18, 7.2]);
  assert.deepEqual(o.hourly.precipitation_probability, [60, 5]); // no probability -> from the amount
  assert.deepEqual(o.hourly.cape, [null, null]);
  assert.deepEqual(o.daily, { time: ["2026-11-02"], weather_code: [61], temperature_2m_max: [7.1], temperature_2m_min: [6.2], precipitation_probability_max: [60], wind_speed_10m_max: [18] });
});

test("the app calls our Worker only on locaride.app", () => {
  const q = new URLSearchParams({ latitude: "45.1", longitude: "6.1" });
  assert.match(meteoUrl(q, "locaride.app"), /^\/api\/meteo\?latitude=45\.1&longitude=6\.1&tz=/);
  assert.match(meteoUrl(q, "localhost"), /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
});

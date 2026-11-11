/*
 * postcard.mjs - "Crea post": the climb as an Instagram-style picture (04/11/2026, Rick).
 * A 3D view of the climb (MapLibre snapshot, drawn by app.mjs) with the big title and
 * "16 km at 8.1%" in the middle, like the climb posts people share, and our numbers, the
 * profile and locaride.app at the bottom. Post 1080x1350 (4:5) or story 1080x1920 (9:16).
 * drawPost() only calls the 2D-canvas API it is given (tested with a recorder).
 */
import { gradeColor, profileShapes } from "./climb.mjs?v=50";
import { routeShape, sampleGrades } from "./rideout.mjs?v=50";

export const POST = { w: 1080, h: 1350 }, STORY = { w: 1080, h: 1920 };
const TX = {
  it: { at: "al", gain: "dislivello", max: "max", top: "cima", from: "Da", tag: "SALITA" },
  en: { at: "at", gain: "elevation gain", max: "max", top: "summit", from: "From", tag: "CLIMB" },
  es: { at: "al", gain: "desnivel", max: "máx", top: "cima", from: "Desde", tag: "PUERTO" }
};
export const MOTTO = ["RIDE LIKE", "A LOCAL"];
const LOC = { it: "it-IT", en: "en-GB", es: "es-ES" };
export const n0 = (x, d, lang = "it") => (x == null || !isFinite(x)) ? "–" : Number(x).toLocaleString(LOC[lang] || "it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });

/* the two big lines and the small one, in the user's language */
export function postText(c, v, lang = "it") {
  const T = TX[lang] || TX.it, km = +v.distance_km || 0;
  const gain = v.endElevation != null && v.startElevation != null ? Math.round(v.endElevation - v.startElevation) : null;
  const side = String(v.side || "").replace(/^(Da|From|Desde)\s+/i, "");
  return {
    title: String(c.name || "").toUpperCase(),
    big: `${n0(km, km < 10 ? 1 : km < 100 ? 1 : 0, lang)} km ${T.at} ${n0(+v.avgGradient || 0, 1, lang)}%`,
    small: [gain != null ? `+${n0(gain, 0, lang)} m` : null, v.maxGradient ? `${T.max} ${n0(+v.maxGradient, 0, lang)}%` : null,
      v.endElevation != null ? `${T.top} ${n0(v.endElevation, 0, lang)} m` : null].filter(Boolean).join("  ·  "),
    from: side ? `${T.from} ${side}` : "",
    tag: T.tag
  };
}

/* bg: a canvas/image of the 3D view (or null: plain dark), drawn to cover the whole picture */
export function drawPost(ctx, c, v, opt = {}) {
  const W = opt.w || POST.w, H = opt.h || POST.h, lang = opt.lang || "it", t = postText(c, v, lang);
  const cond = opt.cond || "'Barlow Condensed', 'Arial Narrow', sans-serif", body = opt.body || "Barlow, system-ui, sans-serif";
  const BG = "#0B0F14", TXc = "#F4F7FA", MU = "#B9C4CF", ACC = "#C8F560";
  const font = (w, px, fam, it = false) => `${it ? "italic " : ""}${w} ${px}px ${fam}`;
  const spaced = (px) => { if ("letterSpacing" in ctx) ctx.letterSpacing = px + "px"; };
  const fit = (s, max, w, px, fam, it) => { let p = px; ctx.font = font(w, p, fam, it); while (ctx.measureText(s).width > max && p > 30) { p -= 3; ctx.font = font(w, p, fam, it); } return p; };
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  if (opt.bg) {
    // cover; opt.focus (0..1) moves a tall photo up/down, a wide one left/right
    const bw = opt.bg.width, bh = opt.bg.height, s = Math.max(W / bw, H / bh), f = opt.focus == null ? 0.5 : opt.focus;
    ctx.drawImage(opt.bg, (W - bw * s) * (bw * s > W ? f : 0.5), (H - bh * s) * (bh * s > H ? f : 0.5), bw * s, bh * s);
  } else {
    // no 3D view (offline, no WebGL): not a black slab - a night-blue sky and the climb's own shape, big and soft
    const sky = ctx.createRadialGradient(W * 0.5, H * 0.38, 40, W * 0.5, H * 0.45, H * 0.8);
    sky.addColorStop(0, "#2B4A66"); sky.addColorStop(0.55, "#16283A"); sky.addColorStop(1, "#0B0F14");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const pts = routeShape(v.track, W - 160, H * 0.62, 30).map((q) => [q[0] + 80, q[1] + H * 0.12]), gr = sampleGrades(v);
    if (pts.length > 1) {
      ctx.save(); ctx.globalAlpha = 0.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 34; ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
      ctx.lineWidth = 18;
      for (let i = 1; i < pts.length; i++) { ctx.strokeStyle = gradeColor(gr[Math.min(gr.length - 1, Math.round(i / (pts.length - 1) * (gr.length - 1)))]); ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }
      ctx.restore();
    }
  }
  // shade top and bottom so white text reads on any terrain
  const gt = ctx.createLinearGradient(0, 0, 0, H * 0.3); gt.addColorStop(0, "rgba(11,15,20,.6)"); gt.addColorStop(1, "rgba(11,15,20,0)");
  ctx.fillStyle = gt; ctx.fillRect(0, 0, W, H * 0.3);
  const g0 = H > W * 1.5 ? 0.6 : 0.52, gb = ctx.createLinearGradient(0, H * g0, 0, H); gb.addColorStop(0, "rgba(11,15,20,0)"); gb.addColorStop(0.4, "rgba(11,15,20,.78)"); gb.addColorStop(1, "rgba(11,15,20,.96)");
  ctx.fillStyle = gb; ctx.fillRect(0, H * g0, W, H * (1 - g0));
  // logo
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.fillStyle = ACC; ctx.fillRect(64, 62, 26, 26);
  ctx.fillStyle = TXc; ctx.font = font(800, 40, cond, true); ctx.fillText("LOCARIDE", 104, 88);
  // the motto, small, on two lines (Rick, 05/11: instead of "SALITA")
  ctx.fillStyle = ACC; ctx.textAlign = "right"; ctx.font = font(600, 23, cond); spaced(2);
  ctx.fillText(MOTTO[0], W - 64, 70); ctx.fillText(MOTTO[1], W - 64, 96); spaced(0);
  // bottom band, not over the picture: name, "17,3 km al 7,9%", profile, numbers, where it starts
  const tall = H > W * 1.5, pw = W - 128, ph = tall ? 190 : 130, py = H - (tall ? 450 : 360);
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
  ctx.fillStyle = TXc; ctx.textAlign = "left"; spaced(1);
  fit(t.title, W - 128, 600, tall ? 76 : 68, cond); ctx.fillText(t.title, 64, py - (tall ? 92 : 84)); spaced(0);
  ctx.fillStyle = ACC; fit(t.big, W - 128, 600, tall ? 48 : 44, cond); ctx.fillText(t.big, 64, py - 30);
  ctx.restore();
  const sh = profileShapes(v, pw, ph, 6);   // the same profile and colours as the climb page (Rick, 07/11)
  ctx.save(); ctx.translate(64, py);
  if (typeof Path2D === "function" && sh.segs.length) {
    for (const s of sh.segs) { ctx.fillStyle = s.color || gradeColor(0); ctx.fill(new Path2D(s.d)); }
    ctx.strokeStyle = TXc; ctx.lineWidth = 3; ctx.stroke(new Path2D(sh.line));
  }
  ctx.restore();
  ctx.textAlign = "left"; ctx.fillStyle = TXc; fit(t.small, W - 128, 600, 40, body); ctx.fillText(t.small, 64, py + ph + 62);
  if (t.from) { ctx.fillStyle = MU; fit(t.from, W - 128, 500, 30, body); ctx.fillText(t.from, 64, py + ph + 108); }
  ctx.fillStyle = MU; ctx.font = font(500, 22, body);
  ctx.fillText(opt.credit || (opt.photo ? "© OpenStreetMap" : opt.bg ? "© OpenStreetMap · Sentinel-2 cloudless 2016 EOX (CC BY 4.0) · Mapzen" : "© OpenStreetMap"), 64, H - 52);
  ctx.fillStyle = ACC; ctx.font = font(800, 40, cond, true); ctx.textAlign = "right"; ctx.fillText("locaride.app", W - 64, H - 48);
  return t;
}

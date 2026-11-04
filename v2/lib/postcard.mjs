/*
 * postcard.mjs - "Crea post": the climb as an Instagram-style picture (04/11/2026, Rick).
 * A 3D view of the climb (MapLibre snapshot, drawn by app.mjs) with the big title and
 * "16 km at 8.1%" in the middle, like the climb posts people share, and our numbers, the
 * profile and locaride.app at the bottom. Post 1080x1350 (4:5) or story 1080x1920 (9:16).
 * drawPost() only calls the 2D-canvas API it is given (tested with a recorder).
 */
import { gradeColor } from "./climb.mjs?v=40";
import { smoothProfile } from "./rideout.mjs?v=40";

export const POST = { w: 1080, h: 1350 }, STORY = { w: 1080, h: 1920 };
const TX = {
  it: { at: "al", gain: "dislivello", max: "max", top: "cima", from: "Da", tag: "SALITA" },
  en: { at: "at", gain: "elevation gain", max: "max", top: "summit", from: "From", tag: "CLIMB" },
  es: { at: "al", gain: "desnivel", max: "máx", top: "cima", from: "Desde", tag: "PUERTO" }
};
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
  const fit = (s, max, w, px, fam, it) => { let p = px; ctx.font = font(w, p, fam, it); while (ctx.measureText(s).width > max && p > 30) { p -= 3; ctx.font = font(w, p, fam, it); } return p; };
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  if (opt.bg) {
    const bw = opt.bg.width, bh = opt.bg.height, s = Math.max(W / bw, H / bh);
    ctx.drawImage(opt.bg, (W - bw * s) / 2, (H - bh * s) / 2, bw * s, bh * s);
  }
  // shade top and bottom so white text reads on any terrain
  const gt = ctx.createLinearGradient(0, 0, 0, H * 0.3); gt.addColorStop(0, "rgba(11,15,20,.75)"); gt.addColorStop(1, "rgba(11,15,20,0)");
  ctx.fillStyle = gt; ctx.fillRect(0, 0, W, H * 0.3);
  const gb = ctx.createLinearGradient(0, H * 0.58, 0, H); gb.addColorStop(0, "rgba(11,15,20,0)"); gb.addColorStop(0.45, "rgba(11,15,20,.82)"); gb.addColorStop(1, "rgba(11,15,20,.96)");
  ctx.fillStyle = gb; ctx.fillRect(0, H * 0.58, W, H * 0.42);
  // logo
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.fillStyle = ACC; ctx.fillRect(64, 62, 26, 26);
  ctx.fillStyle = TXc; ctx.font = font(800, 40, cond, true); ctx.fillText("LOCARIDE", 104, 88);
  ctx.fillStyle = ACC; ctx.font = font(800, 30, cond, true); ctx.textAlign = "right"; ctx.fillText(t.tag, W - 64, 86);
  // the big title and "17,3 km al 7,9%", centred a bit above the middle, with a soft shadow
  const cy = Math.round(H * (H > W * 1.5 ? 0.40 : 0.42));
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 3;
  ctx.fillStyle = TXc; ctx.textAlign = "center";
  fit(t.title, W - 120, 800, 132, cond, true); ctx.fillText(t.title, W / 2, cy);
  fit(t.big, W - 160, 800, 104, cond, true); ctx.fillText(t.big, W / 2, cy + 118);
  ctx.restore();
  // bottom: profile coloured by gradient, then the numbers and where it starts
  const pw = W - 128, ph = H > W * 1.5 ? 210 : 150, py = H - (H > W * 1.5 ? 470 : 380);
  const sh = smoothProfile(v, pw, ph, 6);
  ctx.save(); ctx.translate(64, py);
  if (typeof Path2D === "function" && sh.segs.length) {
    for (const s of sh.segs) { ctx.fillStyle = s.color || gradeColor(0); ctx.fill(new Path2D(s.d)); }
    ctx.strokeStyle = TXc; ctx.lineWidth = 3; ctx.stroke(new Path2D(sh.line));
  }
  ctx.restore();
  ctx.textAlign = "left"; ctx.fillStyle = TXc; fit(t.small, W - 128, 700, 46, body); ctx.fillText(t.small, 64, py + ph + 70);
  if (t.from) { ctx.fillStyle = MU; fit(t.from, W - 128, 500, 34, body); ctx.fillText(t.from, 64, py + ph + 122); }
  ctx.fillStyle = MU; ctx.font = font(500, 22, body); ctx.fillText("© OpenStreetMap · OpenFreeMap · Mapzen", 64, H - 52);
  ctx.fillStyle = ACC; ctx.font = font(800, 40, cond, true); ctx.textAlign = "right"; ctx.fillText("locaride.app", W - 64, H - 48);
  return t;
}

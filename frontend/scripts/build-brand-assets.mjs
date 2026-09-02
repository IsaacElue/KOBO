/**
 * Regenerates the Kobo brand assets from the supplied master logo.
 *
 *   node scripts/build-brand-assets.mjs [path-to-KOBOLOGO.png]
 *
 * Master: a transparent PNG of the dotted-K + "KOBO" wordmark
 * (default: frontend/brand-assets/KOBOLOGO.png — the checked-in source of
 * truth). This script crops it to a tight bounding box (full lockup, and the
 * K symbol alone), re-tints, and resizes — geometry is never redrawn.
 *
 * Emits:
 *   public/brand/kobo-logo.png         full lockup, ink #0b1f24   → <KoboLogo variant="full">
 *   public/brand/kobo-mark.png         K symbol,   ink #0b1f24    → <KoboLogo variant="mark">
 *   public/brand/kobo-icon.png         96² K, ink  #0b1f24        → browser tab, LIGHT chrome
 *   public/brand/kobo-icon-light.png   96² K, mint #eaf6f1        → browser tab, DARK chrome
 *   public/brand/kobo-apple-icon.png   180² K, ink #0b1f24        → iOS home screen
 *   app/favicon.ico                    32² K,  ink #0b1f24        → legacy /favicon.ico fallback
 *
 * app/layout.tsx's `metadata.icons` wires the tab PNGs with a
 * `(prefers-color-scheme: dark)` media query, plus the apple icon. `favicon.ico`
 * stays a file-convention asset (Next always emits its link). Re-run if the
 * token or the master logo changes. Requires `sharp` (already a dep).
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync, statSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const base = join(dirname(fileURLToPath(import.meta.url)), "..") + "/";
const SRC = process.argv[2] ?? join(base, "brand-assets", "KOBOLOGO.png");

const INK = { r: 0x0b, g: 0x1f, b: 0x24 }; // --kobo-ink / --landing-ink — for light browser chrome
const MINT = { r: 0xea, g: 0xf6, b: 0xf1 }; // --kobo-mint-light      — for dark browser chrome

const alphaOnlyBBox = (data, w, h, c, xMax) => {
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < Math.min(w, xMax); x++)
      if (data[(y * w + x) * c + 3] > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
};

function firstGapAfterInk(d, w, h, c) {
  const colInk = (x) => {
    for (let y = 0; y < h; y++) if (d[(y * w + x) * c + 3] > 16) return true;
    return false;
  };
  // The K has small internal gaps (between its dot columns and the diagonal);
  // the K↔wordmark gap is much wider. Return the start of the first empty run
  // at least this wide, once the symbol's ink has begun.
  const MIN_WORDMARK_GAP = Math.round(w * 0.03);
  let started = false, run = 0, runStart = 0;
  for (let x = 0; x < w; x++) {
    if (colInk(x)) {
      started = true;
      run = 0;
    } else if (started) {
      if (run === 0) runStart = x;
      if (++run >= MIN_WORDMARK_GAP) return runStart;
    }
  }
  return w;
}

/** Crop `box` from SRC and return a sharp instance recoloured to `tint`, alpha preserved. */
async function tintedCrop(box, tint) {
  const { data, info } = await sharp(SRC).extract(box).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    out[i * 4] = tint.r; out[i * 4 + 1] = tint.g; out[i * 4 + 2] = tint.b; out[i * 4 + 3] = data[i * 4 + 3];
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } });
}

/** Square, transparent, `size`px, the tinted mark centred with `padFrac` breathing room. */
async function squareIconBuffer(box, tint, size, padFrac) {
  const inner = Math.round(size * (1 - padFrac * 2));
  const mark = await (await tintedCrop(box, tint))
    .resize({ width: inner, height: inner, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

mkdirSync(base + "public/brand", { recursive: true });

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const fullBox = alphaOnlyBBox(data, info.width, info.height, 4, info.width);
const markBox = alphaOnlyBBox(data, info.width, info.height, 4, firstGapAfterInk(data, info.width, info.height, 4));

// Primary logo assets — unchanged (ink, for on-page UI)
await (await tintedCrop(fullBox, INK)).png({ palette: true, effort: 10, compressionLevel: 9 }).toFile(base + "public/brand/kobo-logo.png");
await (await tintedCrop(markBox, INK)).png({ palette: true, effort: 10, compressionLevel: 9 }).toFile(base + "public/brand/kobo-mark.png");

// Browser-tab icons — one per colour scheme (wired via metadata.icons media query)
writeFileSync(base + "public/brand/kobo-icon.png", await squareIconBuffer(markBox, INK, 96, 0.15));
writeFileSync(base + "public/brand/kobo-icon-light.png", await squareIconBuffer(markBox, MINT, 96, 0.15));

// iOS home-screen icon — no media variant needed
writeFileSync(base + "public/brand/kobo-apple-icon.png", await squareIconBuffer(markBox, INK, 180, 0.16));

// Legacy /favicon.ico — one 32² PNG entry (valid PNG-in-ICO, honoured by every modern browser)
const png32 = await squareIconBuffer(markBox, INK, 32, 0.15);
const header = Buffer.alloc(6); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry.writeUInt8(32, 0); entry.writeUInt8(32, 1); entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png32.length, 8); entry.writeUInt32LE(22, 12);
writeFileSync(base + "app/favicon.ico", Buffer.concat([header, entry, png32]));

// The old single-colour file-convention app icons are superseded by the
// media-scoped PNGs + metadata.icons above.
rmSync(base + "app/icon.png", { force: true });
rmSync(base + "app/apple-icon.png", { force: true });

for (const f of [
  "public/brand/kobo-logo.png", "public/brand/kobo-mark.png",
  "public/brand/kobo-icon.png", "public/brand/kobo-icon-light.png",
  "public/brand/kobo-apple-icon.png", "app/favicon.ico",
]) {
  console.log(`  ${f}  ${(statSync(base + f).size / 1024).toFixed(1)} KB`);
}
console.log("done.");

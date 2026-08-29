/**
 * The hero's four-currency coin motif from the Landing export: € · USDC · $ · ₦,
 * four milled silver discs overlapping slightly, each drifting on its own slow
 * tilt cycle (CSS keyframes in globals.css, disabled under prefers-reduced-motion).
 *
 * This is the lightweight placeholder for the interactive/3D coin. When the
 * Spline embed is ready, drop it in here in place of the `.coin-row` block — the
 * surrounding layout (centered, ~260px tall, sits under the hero copy) is what
 * it needs to fill. The GSAP single-coin version lives in `morphing-coin.tsx`
 * and is still used for the mid-page beat.
 */

const SILVER =
  "conic-gradient(from var(--from), #d3d8dc, #8f9a9f, #eef1f2, #7c878d, #c7ccd0, #d3d8dc)";

type Coin = {
  glyph: string;
  size: number;
  glyphPx: number;
  from: string;
  z: number;
  overlap: number;
  tilt: 1 | 2 | 3 | 4;
};

const COINS: Coin[] = [
  { glyph: "€", size: 170, glyphPx: 64, from: "210deg", z: 1, overlap: -26, tilt: 1 },
  { glyph: "USDC", size: 190, glyphPx: 30, from: "160deg", z: 2, overlap: -30, tilt: 2 },
  { glyph: "$", size: 190, glyphPx: 64, from: "100deg", z: 2, overlap: -30, tilt: 3 },
  { glyph: "₦", size: 170, glyphPx: 60, from: "250deg", z: 1, overlap: 0, tilt: 4 },
];

export function CoinRow() {
  return (
    <div
      className="coin-row mx-auto max-w-full scale-[0.62] sm:scale-90 lg:scale-100"
      aria-hidden
    >
      {COINS.map((c, i) => (
        <div
          key={i}
          className={`coin-disc coin-tilt-${c.tilt}`}
          style={
            {
              width: c.size,
              height: c.size,
              marginRight: c.overlap,
              zIndex: c.z,
              "--from": c.from,
              background: SILVER,
            } as React.CSSProperties
          }
        >
          <span style={{ fontSize: c.glyphPx, letterSpacing: c.glyph === "USDC" ? "-0.02em" : undefined }}>
            {c.glyph}
          </span>
        </div>
      ))}
    </div>
  );
}

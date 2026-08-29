"use client";

import { useRef } from "react";
import { gsap, useGSAP, ScrollTrigger, CustomWiggle } from "@/lib/gsap";

// Thin discs stacked through Z to fake coin thickness / a milled rim.
const SLICES = 15;
const SLICE_SPAN = 15; // px from back face to front face
// Which face is showing after each half-turn. Reconciled to the Landing
// export's four-currency motif: euro in, tumbles through USDC and the dollar,
// flashes the naira it can become, settles on USDC (what actually lands).
const FACE_SEQUENCE = ["euro", "usdc", "dollar", "naira", "usdc"] as const;

export function MorphingCoin() {
  const stageRef = useRef<HTMLDivElement>(null);
  const coinRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const artRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useGSAP(
    () => {
      const coin = coinRef.current;
      const stage = stageRef.current;
      const shadow = shadowRef.current;
      if (!coin || !stage || !shadow) return;

      CustomWiggle.create("coinSettle", { wiggles: 5, type: "easeOut" });

      const faces = FACE_SEQUENCE.reduce<Record<string, HTMLDivElement | null>>(
        (acc, name) => ({ ...acc, [name]: artRefs.current[name] }),
        {},
      );
      const showFace = (name: string, instant = false) => {
        Object.entries(faces).forEach(([key, el]) => {
          if (!el) return;
          gsap.to(el, {
            opacity: key === name ? 1 : 0,
            duration: instant ? 0 : 0.12,
            overwrite: "auto",
          });
        });
      };

      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (reduced) {
        gsap.set(coin, { rotationY: 0, rotationX: 4, scale: 1, opacity: 1 });
        showFace("usdc", true);
        return;
      }

      showFace("euro", true);
      gsap.set(coin, { rotationY: -1080, rotationX: 14, scale: 0.4, opacity: 0 });
      gsap.set(shadow, { scale: 0.6, opacity: 0.15 });

      let lastCrossing = -1;
      const swapByAngle = () => {
        const ry = gsap.getProperty(coin, "rotationY") as number;
        const crossing = Math.floor((ry + 1080) / 180);
        if (crossing !== lastCrossing) {
          lastCrossing = crossing;
          const idx = Math.min(crossing, FACE_SEQUENCE.length - 1);
          showFace(FACE_SEQUENCE[Math.max(0, idx)]);
        }
      };

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(coin, { opacity: 1, duration: 0.35 }, 0)
        .to(coin, { scale: 1, duration: 1.15, ease: "back.out(1.3)" }, 0)
        .to(shadow, { scale: 1, opacity: 0.5, duration: 1.15 }, 0)
        .to(
          coin,
          {
            rotationY: 0,
            rotationX: 4,
            duration: 2.1,
            ease: "power4.out",
            onUpdate: swapByAngle,
          },
          0,
        )
        .to(coin, { rotationY: -12, duration: 0.18, ease: "power1.in" }, ">-0.05")
        .to(coin, {
          rotationY: 0,
          duration: 1,
          ease: "coinSettle",
          onComplete: () => showFace("usdc", true),
        });

      // Gentle idle once it has landed: a slow bob + a few degrees of drift.
      tl.add(() => {
        gsap.to(coin, {
          y: -12,
          duration: 2.6,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        });
        gsap.to(coin, {
          rotationY: 7,
          duration: 5,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        });
        gsap.to(shadow, {
          scale: 0.9,
          opacity: 0.34,
          duration: 2.6,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        });
      });

      // Pointer parallax — tilt on X only so it never fights the idle drift.
      const onMove = (e: PointerEvent) => {
        const rect = stage.getBoundingClientRect();
        const ny = (e.clientY - rect.top) / rect.height - 0.5;
        const nx = (e.clientX - rect.left) / rect.width - 0.5;
        gsap.to(coin, {
          rotationX: 4 - ny * 10,
          x: nx * 10,
          duration: 0.8,
          ease: "power2.out",
          overwrite: "auto",
        });
      };
      const onLeave = () =>
        gsap.to(coin, { rotationX: 4, x: 0, duration: 1, ease: "power2.out" });
      stage.addEventListener("pointermove", onMove);
      stage.addEventListener("pointerleave", onLeave);

      // Drift up and dim as the hero scrolls away.
      const st = ScrollTrigger.create({
        trigger: stage,
        start: "center center",
        end: "+=520",
        scrub: true,
        animation: gsap.to(stage, {
          yPercent: -14,
          autoAlpha: 0.25,
          ease: "none",
        }),
      });

      return () => {
        st.kill();
        stage.removeEventListener("pointermove", onMove);
        stage.removeEventListener("pointerleave", onLeave);
      };
    },
    { scope: stageRef },
  );

  return (
    <div ref={stageRef} className="coin-stage mx-auto">
      <div ref={coinRef} className="coin">
        <div className="coin-face coin-front">
          <div
            ref={(el) => {
              artRefs.current.euro = el;
            }}
            className="coin-art"
          >
            <EuroFace />
          </div>
          <div
            ref={(el) => {
              artRefs.current.usdc = el;
            }}
            className="coin-art"
          >
            <UsdcFace />
          </div>
          <div
            ref={(el) => {
              artRefs.current.dollar = el;
            }}
            className="coin-art"
          >
            <DollarFace />
          </div>
          <div
            ref={(el) => {
              artRefs.current.naira = el;
            }}
            className="coin-art"
          >
            <NairaFace />
          </div>
        </div>

        <div className="coin-face coin-back">
          <BackFace />
        </div>

        {Array.from({ length: SLICES }, (_, i) => {
          const z = -SLICE_SPAN / 2 + (i / (SLICES - 1)) * SLICE_SPAN;
          return (
            <div
              key={i}
              className="coin-slice"
              style={{ transform: `translateZ(${z.toFixed(2)}px)` }}
            />
          );
        })}
      </div>
      <div ref={shadowRef} className="coin-shadow" />
    </div>
  );
}

/* ---- Coin faces (viewBox 0 0 200 200) ---- */

function EuroFace() {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden>
      <defs>
        <radialGradient id="euroGold" cx="38%" cy="32%" r="78%">
          <stop offset="0%" stopColor="#F8E9BE" />
          <stop offset="42%" stopColor="#DEBB6C" />
          <stop offset="74%" stopColor="#AE863E" />
          <stop offset="100%" stopColor="#7C5D28" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="100" fill="url(#euroGold)" />
      <circle cx="100" cy="100" r="84" fill="none" stroke="#6F5327" strokeWidth="2" opacity="0.5" />
      <ellipse cx="72" cy="64" rx="46" ry="30" fill="#FFFFFF" opacity="0.22" />
      <text
        x="100"
        y="102"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-display)"
        fontSize="118"
        fontWeight={600}
        fill="#553F1C"
      >
        €
      </text>
    </svg>
  );
}

function UsdcFace() {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden>
      <defs>
        <radialGradient id="usdcBlue" cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#4C97E6" />
          <stop offset="55%" stopColor="#2775CA" />
          <stop offset="100%" stopColor="#1B5AA0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="100" fill="url(#usdcBlue)" />
      <ellipse cx="74" cy="62" rx="44" ry="28" fill="#FFFFFF" opacity="0.16" />
      <circle cx="100" cy="100" r="74" fill="none" stroke="#FFFFFF" strokeWidth="6" opacity="0.9" />
      <text
        x="100"
        y="104"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-space-grotesk), sans-serif"
        fontSize="46"
        fontWeight={700}
        letterSpacing="-2"
        fill="#FFFFFF"
      >
        USDC
      </text>
    </svg>
  );
}

function DollarFace() {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden>
      <defs>
        <radialGradient id="dollarSilver" cx="38%" cy="30%" r="82%">
          <stop offset="0%" stopColor="#EEF1F2" />
          <stop offset="48%" stopColor="#C7CCD0" />
          <stop offset="78%" stopColor="#8F9A9F" />
          <stop offset="100%" stopColor="#6B7479" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="100" fill="url(#dollarSilver)" />
      <circle cx="100" cy="100" r="84" fill="none" stroke="#5B6469" strokeWidth="2" opacity="0.45" />
      <ellipse cx="72" cy="64" rx="46" ry="30" fill="#FFFFFF" opacity="0.35" />
      <text
        x="100"
        y="106"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-space-grotesk), sans-serif"
        fontSize="112"
        fontWeight={700}
        fill="#586766"
      >
        $
      </text>
    </svg>
  );
}

function NairaFace() {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden>
      <defs>
        <radialGradient id="nairaGreen" cx="38%" cy="30%" r="82%">
          <stop offset="0%" stopColor="#2A8E6E" />
          <stop offset="55%" stopColor="#12645D" />
          <stop offset="100%" stopColor="#04231F" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="100" fill="url(#nairaGreen)" />
      <circle cx="100" cy="100" r="84" fill="none" stroke="#9EE3C6" strokeWidth="1.5" opacity="0.4" />
      <ellipse cx="74" cy="62" rx="42" ry="26" fill="#FFFFFF" opacity="0.1" />
      <text
        x="100"
        y="106"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-space-grotesk), sans-serif"
        fontSize="104"
        fontWeight={700}
        fill="#EAF6F1"
      >
        ₦
      </text>
    </svg>
  );
}

function BackFace() {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden>
      <defs>
        <radialGradient id="backMetal" cx="40%" cy="34%" r="80%">
          <stop offset="0%" stopColor="#2E5C4E" />
          <stop offset="60%" stopColor="#123F38" />
          <stop offset="100%" stopColor="#04231F" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="100" fill="url(#backMetal)" />
      <circle cx="100" cy="100" r="84" fill="none" stroke="#9EE3C6" strokeWidth="1.5" opacity="0.3" />
      <text
        x="100"
        y="104"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-space-grotesk), sans-serif"
        fontSize="96"
        fontWeight={700}
        fill="#9EE3C6"
        opacity="0.9"
      >
        K
      </text>
    </svg>
  );
}

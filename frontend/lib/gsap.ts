"use client";

/**
 * Central GSAP setup. Import from here (`@/lib/gsap`) instead of `gsap` directly
 * so every plugin is registered exactly once and only on the client.
 *
 * As of GSAP 3.13 every plugin below ships in the free public package.
 * This registers the full set for design/prototyping — once the redesign
 * settles, trim the imports to just what's used to keep the bundle small.
 */

import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

import { CustomEase } from "gsap/CustomEase";
import { CustomBounce } from "gsap/CustomBounce"; // requires CustomEase
import { CustomWiggle } from "gsap/CustomWiggle"; // requires CustomEase
import { RoughEase, ExpoScaleEase, SlowMo } from "gsap/EasePack";

import { Draggable } from "gsap/Draggable";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { EaselPlugin } from "gsap/EaselPlugin";
import { Flip } from "gsap/Flip";
import { GSDevTools } from "gsap/GSDevTools";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { MotionPathHelper } from "gsap/MotionPathHelper";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { Observer } from "gsap/Observer";
import { Physics2DPlugin } from "gsap/Physics2DPlugin";
import { PhysicsPropsPlugin } from "gsap/PhysicsPropsPlugin";
import { PixiPlugin } from "gsap/PixiPlugin";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollSmoother } from "gsap/ScrollSmoother"; // requires ScrollTrigger
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { SplitText } from "gsap/SplitText";
import { TextPlugin } from "gsap/TextPlugin";

// registerPlugin is idempotent, but guard so it only runs once, in the browser.
declare global {
  var __koboGsapReady: boolean | undefined;
}

if (typeof window !== "undefined" && !globalThis.__koboGsapReady) {
  globalThis.__koboGsapReady = true;
  gsap.registerPlugin(
    useGSAP,
    Draggable,
    DrawSVGPlugin,
    EaselPlugin,
    Flip,
    GSDevTools,
    InertiaPlugin,
    MotionPathPlugin,
    MotionPathHelper,
    MorphSVGPlugin,
    Observer,
    Physics2DPlugin,
    PhysicsPropsPlugin,
    PixiPlugin,
    ScrambleTextPlugin,
    ScrollTrigger,
    ScrollSmoother,
    ScrollToPlugin,
    SplitText,
    TextPlugin,
    RoughEase,
    ExpoScaleEase,
    SlowMo,
    CustomEase,
    CustomBounce,
    CustomWiggle,
  );

  // Respect users who ask for less motion.
  const reduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    gsap.globalTimeline.timeScale(200);
    ScrollTrigger.config({ ignoreMobileResize: true });
  }
}

export {
  gsap,
  useGSAP,
  CustomEase,
  CustomBounce,
  CustomWiggle,
  RoughEase,
  ExpoScaleEase,
  SlowMo,
  Draggable,
  DrawSVGPlugin,
  EaselPlugin,
  Flip,
  GSDevTools,
  InertiaPlugin,
  MotionPathPlugin,
  MotionPathHelper,
  MorphSVGPlugin,
  Observer,
  Physics2DPlugin,
  PhysicsPropsPlugin,
  PixiPlugin,
  ScrambleTextPlugin,
  ScrollTrigger,
  ScrollSmoother,
  ScrollToPlugin,
  SplitText,
  TextPlugin,
};

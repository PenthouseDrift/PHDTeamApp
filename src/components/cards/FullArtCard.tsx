"use client";

import { useEffect, useId, useRef } from "react";
import { Barlow_Condensed } from "next/font/google";
import { darken, lighten } from "@/lib/card-maker";
import { tierInfo, type FullArtCardData } from "@/lib/full-art-card";
import { getCrewCardDefinition } from "@/lib/crew-cards";
import { HEADER_LOGO_SRC, headerLogoStyle, headerTagLayout } from "@/components/cards/card-header";

const cardFont = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"] });

/**
 * The full art PHD card: the picture fills the whole card and a thin tier-coloured frame,
 * a tier tag, and a text block sit over it. Like PhdCard, everything is sized in `cqw`
 * (1% of the card's own width) so it renders the same at any size, including 63mm printed.
 * The card is 100 units wide and 139.7 tall (63 x 88).
 */

const H = 139.7;
const PAD = 13; // Canvas padding around the 100 x 139.7 card in card units
const CW = 100 + PAD * 2; // 126
const CH = H + PAD * 2; // 165.7

/** Each stat is out of 25, so the total score is out of 100. */
const MAX_STAT = 25;
const MAX_TOTAL_SCORE = 100;

const abs = (style: React.CSSProperties): React.CSSProperties => ({ position: "absolute", ...style });

const BLOB_HOST_RE = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;
const NEXT_IMAGE_WIDTHS = [256, 384, 640, 750, 828] as const;

function getOptimizedCardImageProps(url: string, flat: boolean) {
  if (flat || !BLOB_HOST_RE.test(url)) {
    return { src: url, srcSet: undefined, sizes: undefined };
  }
  const encoded = encodeURIComponent(url);
  return {
    src: `/_next/image?url=${encoded}&w=640&q=75`,
    srcSet: NEXT_IMAGE_WIDTHS.map((w) => `/_next/image?url=${encoded}&w=${w}&q=75 ${w}w`).join(", "),
    sizes: "(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 320px",
  };
}

/** A small seeded random generator, so each card's shine is different but never changes between renders. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h ^ (h >>> 16)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MYTHIC_VERTEX_SHADER = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

/**
 * WebGL fragment shader adapted directly from the Ashima 3D Simplex Noise Fire & Sparks shader
 * (snoise + noiseStack + noiseStackUV + pow(1.0 - flames^3, 8.0) + prng spark grid),
 * mapped around the Mythic card's rounded-rectangle border.
 */
const MYTHIC_FRAGMENT_SHADER = `
  precision highp float;
  uniform vec2 resolution;
  uniform float time;

  // Ashima 3D Simplex Noise (Ian McEwan, Ashima Arts)
  vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }

  vec4 mod289(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }

  vec4 permute(vec4 x) {
    return mod289(((x * 34.0) + 1.0) * x);
  }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(
      permute(
        permute(i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0)
      )
      + i.x + vec4(0.0, i1.x, i2.x, 1.0)
    );

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = inversesqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  float prng(in vec2 seed) {
    seed = fract(seed * vec2(5.3983, 5.4427));
    seed += dot(seed.yx, seed.xy + vec2(21.5351, 14.3137));
    return fract(seed.x * seed.y);
  }

  const float PI = 3.1415926535897932384626433832795;

  float noiseStack(vec3 pos, int octaves, float falloff) {
    float noise = snoise(vec3(pos));
    float off = 1.0;
    if (octaves > 1) {
      pos *= 2.0;
      off *= falloff;
      noise = (1.0 - off) * noise + off * snoise(vec3(pos));
    }
    if (octaves > 2) {
      pos *= 2.0;
      off *= falloff;
      noise = (1.0 - off) * noise + off * snoise(vec3(pos));
    }
    if (octaves > 3) {
      pos *= 2.0;
      off *= falloff;
      noise = (1.0 - off) * noise + off * snoise(vec3(pos));
    }
    return (1.0 + noise) / 2.0;
  }

  vec2 noiseStackUV(vec3 pos, int octaves, float falloff, float diff) {
    float displaceA = noiseStack(pos, octaves, falloff);
    float displaceB = noiseStack(pos + vec3(3984.293, 423.21, 5235.19), octaves, falloff);
    return vec2(displaceA, displaceB);
  }

  float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }

  void main() {
    vec2 uv01 = gl_FragCoord.xy / resolution.xy;
    // Map canvas UV to the 100 x 139.7 card coordinate space (with PAD-unit padding on all 4 sides)
    vec2 cardPos = vec2(uv01.x * ${CW.toFixed(1)} - ${PAD.toFixed(1)}, (1.0 - uv01.y) * ${CH.toFixed(1)} - ${PAD.toFixed(1)});
    vec2 p = cardPos - vec2(50.0, ${(H / 2).toFixed(2)});

    // Signed distance to the card's metallic frame (x=1.3..98.7, y=1.3..138.4, rx=4.2)
    float sd = sdRoundedBox(p, vec2(48.7, ${(H / 2 - 1.3).toFixed(2)}), 4.2);

    // Keep the card interior untouched and discard far outside the border
    if (sd < -1.9 || sd > 12.2) {
      gl_FragColor = vec4(0.0);
      return;
    }

    // Flame reach around the border: larger reach along the sides/bottom, licking higher on corners and top
    float topBoost = smoothstep(25.0, -68.0, p.y) * 2.0;
    float cornerBoost = smoothstep(32.0, 48.0, abs(p.x)) * smoothstep(46.0, 68.0, abs(p.y)) * 1.45;
    float flameWidth = 6.8 + topBoost + cornerBoost;

    // Map perpendicular border distance to the original shader's fragCoord.y (0 at base -> clip=210 at outer tip)
    float clip = 210.0;
    float ypartClip = sd >= -0.45
      ? (sd + 0.45) / flameWidth
      : (-0.45 - sd) / 1.35;

    float ypartClippedFalloff = clamp(2.0 - ypartClip, 0.0, 1.0);
    float ypartClipped = min(ypartClip, 1.0);
    float ypartClippedn = 1.0 - ypartClipped;

    // Fuel intensity along the border
    float xfuel = 0.96;

    float timeSpeed = 0.55;
    float realTime = timeSpeed * time;

    // Continuous, seamless perimeter coordinates for X/Z and full 0..2.1 outward range for Y
    float fragY = ypartClip * clip;
    float driftY = p.y + realTime * 14.0;
    vec3 position = vec3(
      (p.x + driftY) * 0.026,
      0.01 * fragY,
      (p.x - driftY) * 0.026
    ) + vec3(1223.0, 6434.0, 8425.0);

    vec3 flow = vec3(
      0.0,
      -2.0 * xfuel * pow(ypartClippedn, 64.0),
      0.0
    );
    vec3 timing = realTime * vec3(0.0, -1.7, 1.1) + flow;

    vec3 displacePos = vec3(1.0, 0.5, 1.0) * 2.4 * position + realTime * vec3(0.01, -0.7, 1.3);
    vec3 displace3 = vec3(noiseStackUV(displacePos, 2, 0.4, 0.1), 0.0);

    vec3 noiseCoord = (vec3(2.0, 1.0, 2.0) * position + timing + 0.4 * displace3);
    float noise = noiseStack(noiseCoord, 3, 0.4);

    float flames = pow(ypartClipped, 0.3 * xfuel) * pow(noise, 0.3 * xfuel);

    float f = ypartClippedFalloff * pow(max(0.0, 1.0 - flames * flames * flames), 8.0);

    // Sparks from the shader, rising in virtual pixel space around the border
    vec2 virtualCoord = vec2(cardPos.x + ${PAD.toFixed(1)}, (${CH.toFixed(1)} - (cardPos.y + ${PAD.toFixed(1)}))) * 4.2;
    float sparkZone = smoothstep(-0.5, 0.1, sd) * (1.0 - smoothstep(flameWidth * 0.55, flameWidth * 1.65, sd));
    float sparkGridSize = 25.0;
    vec2 sparkCoord = virtualCoord - vec2(0.0, 160.0 * realTime);
    sparkCoord -= 25.0 * noiseStackUV(0.01 * vec3(sparkCoord, 24.0 * time), 1, 0.4, 0.1);
    if (mod(sparkCoord.y / sparkGridSize, 2.0) < 1.0) sparkCoord.x += 0.5 * sparkGridSize;
    vec2 sparkGridIndex = vec2(floor(sparkCoord / sparkGridSize));
    float sparkRandom = prng(sparkGridIndex);
    float sparkLife = min(10.0 * (1.0 - min((sparkGridIndex.y + (160.0 * realTime / sparkGridSize)) / (24.0 - 20.0 * sparkRandom), 1.0)), 1.0);

    float sparkMask = 0.0;
    if (sparkLife > 0.0 && sparkZone > 0.01) {
      float sparkSize = xfuel * xfuel * sparkRandom * 0.115;
      float sparkRadians = 999.0 * sparkRandom * 2.0 * PI + 2.0 * time;
      vec2 sparkCircular = vec2(sin(sparkRadians), cos(sparkRadians));
      vec2 sparkOffset = (0.5 - sparkSize) * sparkGridSize * sparkCircular;
      vec2 sparkModulus = mod(sparkCoord + sparkOffset, sparkGridSize) - 0.5 * vec2(sparkGridSize);
      float sparkLength = length(sparkModulus);
      float sparksGray = max(0.0, 1.0 - sparkLength / max(0.001, sparkSize * sparkGridSize));
      sparkMask = clamp(sparkLife * sparksGray * sparkZone * 1.35, 0.0, 1.0);
    }

    // Pure fire hue (R=1.0 everywhere so it NEVER produces black/grey soot on white backgrounds)
    float heat = clamp(f * 1.15, 0.0, 1.0);
    vec3 fireHue = vec3(
      1.0,
      clamp(pow(heat, 1.65) * 1.08, 0.0, 1.0),
      clamp(pow(heat, 4.2) * 1.25, 0.0, 1.0)
    );
    float fireAlpha = clamp(smoothstep(0.015, 0.58, f) * 0.96, 0.0, 1.0);

    vec3 sparkHue = vec3(1.0, 0.48, 0.08);
    float finalAlpha = max(fireAlpha, sparkMask);
    vec3 finalHue = mix(fireHue, sparkHue, clamp(sparkMask * (1.0 - fireAlpha * 0.7), 0.0, 1.0));

    gl_FragColor = vec4(finalHue * finalAlpha, finalAlpha);
  }
`;

/**
 * Renders the Simplex Noise Fire & Sparks WebGL shader directly in front of the Mythic card border.
 */
function MythicFlameCanvases({ seed, animated }: { seed: string; animated: boolean }) {
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const glCanvas = glCanvasRef.current;
    if (!glCanvas) return;

    const prefersReducedMotion =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const shouldAnimate = animated && !prefersReducedMotion;

    const gl = (glCanvas.getContext("webgl", { alpha: true, premultipliedAlpha: true }) ||
      glCanvas.getContext("experimental-webgl", { alpha: true, premultipliedAlpha: true })) as WebGLRenderingContext | null;
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compile(gl.VERTEX_SHADER, MYTHIC_VERTEX_SHADER);
    const fs = compile(gl.FRAGMENT_SHADER, MYTHIC_FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return;
    }

    gl.useProgram(program);
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const posAttr = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    const timeLoc = gl.getUniformLocation(program, "time");
    const resLoc = gl.getUniformLocation(program, "resolution");

    const updateSize = () => {
      const rect = glCanvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const glW = Math.max(240, Math.min(520, Math.round((rect.width || 300) * dpr)));
      const glH = Math.round(glW * (CH / CW));
      if (glCanvas.width !== glW || glCanvas.height !== glH) {
        glCanvas.width = glW;
        glCanvas.height = glH;
        gl.viewport(0, 0, glW, glH);
      }
    };

    updateSize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateSize) : null;
    ro?.observe(glCanvas);

    const rand = seededRandom(`${seed}|simplex-fire`);
    const timeOffset = rand() * 50 + 10;
    const startTime = performance.now();
    let rafId = 0;

    const renderFrame = (now: number) => {
      const elapsed = (now - startTime) * 0.001 + timeOffset;
      if (resLoc) gl.uniform2f(resLoc, glCanvas.width, glCanvas.height);
      if (timeLoc) gl.uniform1f(timeLoc, elapsed);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (shouldAnimate) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      if (posBuffer) gl.deleteBuffer(posBuffer);
      gl.deleteProgram(program);
    };
  }, [seed, animated]);

  const overlayStyle: React.CSSProperties = abs({
    left: `${(-PAD).toFixed(2)}%`,
    top: `${((-PAD / H) * 100).toFixed(2)}%`,
    width: `${CW.toFixed(2)}%`,
    height: `${((CH / H) * 100).toFixed(2)}%`,
    pointerEvents: "none",
  });

  return <canvas ref={glCanvasRef} style={overlayStyle} />;
}


/**
 * The animated border on a Legend or Mythic card.
 *  - Legend: a clean prismatic rainbow border and outer neon aura that continuously sweeps around the frame.
 *  - Mythic: combines the WebGL atmospheric fire/Voronoi spark shader and the 2D FlameParticle canvas
 *    directly in front of the card's border rim.
 * When `animated` is false (printing) or the member prefers reduced motion, it renders as a still border.
 */
function BorderEffects({ variant, seed, animated }: { variant: "legend" | "mythic"; seed: string; animated: boolean }) {
  const rand = seededRandom(`${seed}|border|${variant}`);
  const cls = animated ? "" : " fa-still";
  const phaseDelay = `-${(rand() * 5).toFixed(2)}s`;

  if (variant === "legend") {
    return (
      <div
        aria-hidden
        className={`fa-border${cls}`}
        style={{
          ...abs({ inset: "-0.8cqw", borderRadius: "5.7cqw", pointerEvents: "none" }),
          ["--fa-delay" as string]: phaseDelay,
        }}
      >
        <div className="fa-legend-aura" />
        <div className="fa-legend-ring" />
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className={`fa-border${cls}`}
      style={{
        ...abs({ inset: 0, zIndex: 4, pointerEvents: "none" }),
        ["--fa-delay" as string]: phaseDelay,
      }}
    >
      <MythicFlameCanvases seed={seed} animated={animated} />
    </div>
  );
}

export function FullArtCard({
  card,
  className,
  placeholders = false,
  flat = false,
  showDurability = true,
}: {
  card: FullArtCardData;
  className?: string;
  /** Show hints in empty fields (editor preview only, never printed). */
  placeholders?: boolean;
  /** Print mode: drop the on-screen edge ring. */
  flat?: boolean;
  /** Show durability and repair status overlay for car cards (defaults to true). */
  showDurability?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const tier = tierInfo(card.tier);
  const { light, accent, dark, glow } = tier.palette;
  const isMythic = card.tier === "mythic";
  const isLegend = card.tier === "legend";
  const pale = lighten(accent, 0.72);

  // Every Legend and Mythic card shines differently: its own timing, angle and sparkle spots, seeded from the card.
  const rand = seededRandom(`${card.id ?? ""}|${card.name}|${card.driver}|${card.imageUrl.slice(-24)}`);
  const shine = {
    duration: 3.5 + rand() * 5,
    delay: -rand() * 8,
    angle: 95 + Math.round(rand() * 50),
    mirror: rand() < 0.5,
    gloss: 0.4 + rand() * 0.25,
    hue: Math.round(rand() * 360),
  };
  const sparkleCount = isMythic ? 9 : isLegend ? 4 : 0;
  const sparkles = Array.from({ length: sparkleCount }, () => ({
    x: 6 + rand() * 88,
    y: 5 + rand() * 62,
    size: 2.2 + rand() * 3.6,
    duration: 1.8 + rand() * 3,
    delay: -rand() * 5,
  }));

  // The legend frame is a prismatic gradient; the others are brushed metal in the tier colour.
  const frameStops = isMythic
    ? [
        ["0", "#fff1b8"],
        ["0.25", "#ff2d55"],
        ["0.5", "#ffb020"],
        ["0.75", "#ff2d55"],
        ["1", "#fff1b8"],
      ]
    : isLegend
    ? [
        ["0", "#7df9ff"],
        ["0.25", "#a78bfa"],
        ["0.5", "#ff7ad9"],
        ["0.75", "#ffd75e"],
        ["1", "#7df9ff"],
      ]
    : [
        ["0", light],
        ["0.28", accent],
        ["0.52", dark],
        ["0.74", accent],
        ["1", light],
      ];
  const tagBackground = isMythic
    ? "linear-gradient(120deg, #fff1b8, #ff2d55 40%, #ffb020 70%, #fff1b8)"
    : isLegend
    ? "linear-gradient(120deg, #7df9ff, #a78bfa 35%, #ff7ad9 65%, #ffd75e)"
    : `linear-gradient(135deg, ${light} 0%, ${accent} 45%, ${darken(accent, 0.3)} 100%)`;

  const name = card.name.trim() || (placeholders ? "CAR NAME" : "");
  // One line only: long names step down in size instead of wrapping (average glyph ~0.42 of the font size).
  const nameSize = Math.min(10.5, 80 / Math.max(1, name.length * 0.46));
  const isCar = !card.cardType && !card.crewCardId && (card.tier as string) !== "track";
  const ability =
    card.ability?.trim() ||
    (isCar ? (card as { chassis?: string }).chassis?.trim() || card.name.trim() : "") ||
    (placeholders ? "[Ability / Chassis Type]" : "");
  const effect = card.effect.trim() || (placeholders ? "[Effect / flavour text]" : "");
  const driver = card.driver.trim() || (placeholders ? "[Name]" : "");
  const team = card.team.trim() || (placeholders ? "[Name]" : "");

  // User requested:
  // 1) Mythic cards have stats 25 25 25 25 (total 100/100).
  // 2) Existing legacy cards (stats <= 10) get auto-scaled by 2.5x to the 25-point scale.
  const rawStats = isMythic
    ? { drift: "25", accel: "25", grip: "25", steer: "25" }
    : card.stats;

  const rawVals = [
    Number.parseInt(rawStats.drift, 10),
    Number.parseInt(rawStats.accel, 10),
    Number.parseInt(rawStats.grip, 10),
    Number.parseInt(rawStats.steer, 10),
  ].filter((n) => Number.isFinite(n));

  const isLegacyCard = !isMythic && rawVals.length > 0 && Math.max(...rawVals) <= 10;
  const scaleStatVal = (val: string) => {
    if (isMythic) return "25";
    const n = Number.parseInt(val, 10);
    if (!Number.isFinite(n)) return val;
    if (isLegacyCard) {
      return String(Math.min(25, Math.max(1, Math.round(n * 2.5))));
    }
    return String(Math.min(25, Math.max(1, n)));
  };

  const stats: Array<[string, string]> = [
    ["Drift", scaleStatVal(rawStats.drift)],
    ["Accel", scaleStatVal(rawStats.accel)],
    ["Grip", scaleStatVal(rawStats.grip)],
    ["Steer", scaleStatVal(rawStats.steer)],
  ];

  const isCrew = card.cardType === "crew" || (!card.cardType && Boolean(card.crewCardId));
  const isDebuff = card.cardType === "debuff";
  const isTrack = card.cardType === "track";
  const isMaintenance = card.cardType === "maintenance";
  const isSpecialClashCard = isCrew || isDebuff || isTrack || isMaintenance;

  // The four stats added up, each counted as 0 to 25, so the most a card can score is 100.
  // Nothing is shown while the stats are empty (a blank "__/100" only in the editor preview).
  const statNumbers = stats.map(([, value]) => Number.parseInt(value, 10)).filter((n) => Number.isFinite(n));
  const score: number | "placeholder" | null = isSpecialClashCard
    ? null
    : statNumbers.length > 0
      ? statNumbers.reduce((sum, n) => sum + Math.min(MAX_STAT, Math.max(0, n)), 0)
      : placeholders
        ? "placeholder"
        : null;

  return (
    <div
      className={`${cardFont.className} ${className ?? ""}`}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "63 / 88",
        containerType: "inline-size",
        // Prevent parent drop-shadow filters from casting grey/black shadows behind the semi-transparent Mythic flames
        filter: isMythic ? "none" : undefined,
        // Text inherits text-align, and a <button> parent (card grids) would centre it. The design is left aligned.
        textAlign: "left",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {/* Legend: spinning rainbow glow behind the card edge. */}
      {isLegend && (
        <BorderEffects variant="legend" seed={`${card.id ?? ""}|${card.name}|${card.imageUrl.slice(-24)}`} animated={!flat} />
      )}
      <div
        style={{
          ...abs({ inset: 0 }),
          borderRadius: "5cqw",
          overflow: "hidden",
          background: `linear-gradient(160deg, ${dark}, #0b0b0d)`,
          boxShadow: flat ? "none" : "0 0 0 0.25cqw rgba(0,0,0,0.5)",
        }}
      >
        {/* The picture, edge to edge */}
        {card.imageUrl ? (
          (() => {
            const imgProps = getOptimizedCardImageProps(card.imageUrl, flat);
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgProps.src}
                srcSet={imgProps.srcSet}
                sizes={imgProps.sizes}
                loading={flat ? "eager" : "lazy"}
                decoding="async"
                data-card-image
                alt={card.name}
                style={{
                  ...abs({ inset: 0 }),
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: `${card.imageX}% ${card.imageY}%`,
                  transform: `scale(${card.imageZoom / 100})`,
                  transformOrigin: `${card.imageX}% ${card.imageY}%`,
                  display: "block",
                }}
              />
            );
          })()
        ) : (
          <div style={{ ...abs({ inset: 0 }), display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.45)", fontSize: "9cqw", fontWeight: 800, textAlign: "center", lineHeight: 1 }}>
            PLACE IMAGE HERE
          </div>
        )}

        {/* For special clash cards with SVG background, render the icon in crisp DOM HTML so emojis ALWAYS render across all OS & browsers */}
        {isSpecialClashCard && (!card.imageUrl || card.imageUrl.startsWith("data:image/svg+xml")) && (
          <div
            style={{
              position: "absolute",
              top: "37%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              zIndex: 3,
            }}
          >
            <span
              style={{
                fontSize: "22cqw",
                lineHeight: 1,
                filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.85))",
                userSelect: "none",
              }}
            >
              {card.crewIcon || getCrewCardDefinition(card.crewCardId || card.name)?.icon || (isCrew ? "⚡" : isDebuff ? "⚠️" : isMaintenance ? "🛠️" : "🏁")}
            </span>
          </div>
        )}

        {/* Foil: a soft diagonal sheen, plus a rainbow wash on Legend cards */}
        <div style={{ ...abs({ inset: 0 }), background: "linear-gradient(115deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.16) 48%, rgba(255,255,255,0) 66%)", mixBlendMode: "screen", pointerEvents: "none" }} />
        {/* Legend and Mythic: a bright glint sweeps across, with twinkling sparkles. */}
        {(isLegend || isMythic) && (
          <div aria-hidden style={{ ...abs({ inset: 0 }), overflow: "hidden", pointerEvents: "none" }}>
            <div
              className={flat ? undefined : "fa-crystal-glint"}
              style={{
                ...abs({ inset: 0 }),
                mixBlendMode: "screen",
                opacity: flat ? 0 : shine.gloss,
                transform: shine.mirror ? "scaleX(-1)" : undefined,
                ["--fa-dur" as string]: `${shine.duration}s`,
                ["--fa-delay" as string]: `${shine.delay}s`,
                ["--fa-angle" as string]: `${shine.angle}deg`,
              }}
            />
            {!flat &&
              sparkles.map((sp, i) => (
                <span
                  key={i}
                  className="fa-sparkle"
                  style={{
                    left: `${sp.x}%`,
                    top: `${sp.y}%`,
                    width: `${sp.size}cqw`,
                    height: `${sp.size}cqw`,
                    ["--fa-dur" as string]: `${sp.duration}s`,
                    ["--fa-delay" as string]: `${sp.delay}s`,
                    ["--fa-sparkle" as string]: isMythic ? "#fff1b8" : "#e8f4ff",
                  }}
                />
              ))}
            {/* Mythic only: a second, golden glint, shifting prismatic refractions and a pulsing crimson aura. */}
            {isMythic && !flat && (
              <>
                <div
                  className="fa-prism"
                  style={{ ...abs({ inset: 0 }), ["--fa-dur" as string]: `${shine.duration * 2.2}s`, ["--fa-delay" as string]: `${shine.delay}s`, ["--fa-hue" as string]: `${shine.hue}deg` }}
                />
                <div
                  className="fa-crystal-glint fa-crystal-glint-gold"
                  style={{
                    ...abs({ inset: 0 }),
                    mixBlendMode: "screen",
                    opacity: 0.55,
                    transform: shine.mirror ? undefined : "scaleX(-1)",
                    ["--fa-dur" as string]: `${shine.duration * 1.6}s`,
                    ["--fa-delay" as string]: `${shine.delay * 0.6}s`,
                    ["--fa-angle" as string]: `${shine.angle - 25}deg`,
                  }}
                />
                <div className="fa-mythic-aura" style={{ ...abs({ inset: 0 }), borderRadius: "5cqw", ["--fa-dur" as string]: `${2.6 + (shine.duration % 2)}s`, ["--fa-delay" as string]: `${shine.delay}s` }} />
              </>
            )}
          </div>
        )}
        {isMythic && (
          <div style={{ ...abs({ inset: 0 }), background: "linear-gradient(135deg, rgba(255,45,85,0.22), rgba(255,176,32,0.16) 40%, rgba(255,241,184,0.14) 60%, rgba(255,45,85,0.22))", mixBlendMode: "soft-light", pointerEvents: "none" }} />
        )}
        {isLegend && (
          <div style={{ ...abs({ inset: 0 }), background: "linear-gradient(135deg, rgba(125,249,255,0.2), rgba(167,139,250,0.14) 35%, rgba(255,122,217,0.18) 65%, rgba(255,215,94,0.2))", mixBlendMode: "soft-light", pointerEvents: "none" }} />
        )}
        {/* Darkens the bottom so the text reads on any picture */}
        <div style={{ ...abs({ left: 0, right: 0, bottom: 0, height: "56cqw" }), background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.88) 100%)", pointerEvents: "none" }} />
        {/* A little at the top for the logo and tier tag */}
        <div style={{ ...abs({ left: 0, right: 0, top: 0, height: "26cqw" }), background: "linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0))", pointerEvents: "none" }} />

        {/* Frame: a tier-coloured metal edge with a glow */}
        <div style={{ ...abs({ inset: 0 }), borderRadius: "5cqw", boxShadow: `inset 0 0 5cqw ${glow}66`, pointerEvents: "none" }} />
        <svg viewBox={`0 0 100 ${H}`} style={abs({ inset: 0, width: "100%", height: "100%" })} aria-hidden>
          <defs>
            <linearGradient id={`frame-${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2={H}>
              {frameStops.map(([offset, colour]) => (
                <stop key={offset} offset={offset} stopColor={colour} />
              ))}
            </linearGradient>
          </defs>
          <rect x="1.3" y="1.3" width="97.4" height={H - 2.6} rx="4.2" fill="none" stroke={`url(#frame-${uid})`} strokeWidth="2.6" />
          <rect x="3.1" y="3.1" width="93.8" height={H - 6.2} rx="3" fill="none" stroke={pale} strokeWidth="0.35" opacity="0.8" />
        </svg>

        {/* Top row: the P mark and the tier tag */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={HEADER_LOGO_SRC} alt="" style={headerLogoStyle} />
        {/* Top right: the tier tag with the total score and durability/repair badge directly under it */}
        <div
          style={{
            ...abs({ right: headerTagLayout.right, top: headerTagLayout.top }),
            width: headerTagLayout.width,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "1.6cqw",
          }}
        >
          <div
            style={{
              ...headerTagLayout,
              // The tag sits in the column now, so it takes its place from there.
              position: "static",
              width: "100%",
              background: tagBackground,
              color: isMythic ? "#2a0310" : isLegend ? "#12082e" : darken(accent, 0.72),
              borderColor: pale,
              boxShadow: `0 0 3cqw ${glow}aa, 0 0.6cqw 1cqw rgba(0,0,0,0.5)`,
            }}
          >
            {tier.label}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "1.2cqw",
              width: "100%",
            }}
          >
            {/* Total score, e.g. 23/40, or CREW / DEBUFF / TRACK badge */}
            {isSpecialClashCard ? (
              <span
                style={{
                  padding: "0.9cqw 2.6cqw",
                  borderRadius: "1.2cqw",
                  background: "rgba(0,0,0,0.65)",
                  border: `0.3cqw solid ${accent}`,
                  color: pale,
                  fontSize: "3.7cqw",
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  textShadow: "0 0.2cqw 0.6cqw rgba(0,0,0,0.9)",
                }}
              >
                {isTrack ? "🇬🇧 TRACK" : isDebuff ? "⚠️ DEBUFF" : isMaintenance ? "🛠️ REPAIR" : "⚡ CREW"}
              </span>
            ) : (
              score !== null && (
                <span
                  role="img"
                  aria-label={score === "placeholder" ? `Total score out of ${MAX_TOTAL_SCORE}` : `Total score ${score} out of ${MAX_TOTAL_SCORE}`}
                  style={{
                    padding: "0.9cqw 2.4cqw",
                    borderRadius: "1.2cqw",
                    background: "rgba(0,0,0,0.5)",
                    border: `0.3cqw solid ${accent}`,
                    color: pale,
                    fontSize: "4cqw",
                    fontWeight: 800,
                    letterSpacing: "0.04em",
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                    textShadow: "0 0.2cqw 0.6cqw rgba(0,0,0,0.9)",
                  }}
                >
                  {score === "placeholder" ? "__" : score}/{MAX_TOTAL_SCORE}
                </span>
              )
            )}

            {/* Durability & Battles Available / Repair Overlay for Car Cards */}
            {showDurability && !isSpecialClashCard && !placeholders && (() => {
              const cardFault = card.fault;
              const hasActiveFault = Boolean(cardFault && typeof cardFault.battlesRemaining === "number" && cardFault.battlesRemaining > 0);
              const rawRemaining = card.battlesRemaining;
              const rawMax = card.maxBattles;
              const isLoaner = Boolean(card.id?.startsWith("loaner-") || (card as { userId?: string }).userId === "loaner");

              // Needs repair if active fault or 0 battles remaining
              const needsRepair = hasActiveFault || rawRemaining === 0;

              if (needsRepair) {
                return (
                  <span
                    role="img"
                    aria-label="Needs repair"
                    title={cardFault?.battlesRemaining ? `Needs repair (${cardFault.battlesRemaining} battles)` : "Needs repair"}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: "6.4cqw",
                      padding: "0.65cqw 1.8cqw",
                      borderRadius: "1.2cqw",
                      fontSize: "4.6cqw",
                      fontWeight: 900,
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                      background: "linear-gradient(135deg, rgba(220, 38, 38, 0.96), rgba(153, 27, 27, 0.96))",
                      border: "0.35cqw solid #fca5a5",
                      color: "#ffffff",
                      boxShadow: "0 0 3cqw rgba(239, 68, 68, 0.75), 0 0.6cqw 1cqw rgba(0,0,0,0.85)",
                      textShadow: "0 0.2cqw 0.6cqw rgba(0,0,0,0.9)",
                    }}
                  >
                    🔧
                  </span>
                );
              }

              if (isLoaner) {
                return (
                  <span
                    role="img"
                    aria-label="Rental Ready"
                    title="Rental Ready"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: "6.4cqw",
                      padding: "0.65cqw 1.8cqw",
                      borderRadius: "1.2cqw",
                      fontSize: "4.6cqw",
                      fontWeight: 900,
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                      background: "rgba(0, 0, 0, 0.75)",
                      border: "0.35cqw solid #38bdf8",
                      color: "#7dd3fc",
                      boxShadow: "0 0.6cqw 1cqw rgba(0,0,0,0.8)",
                      textShadow: "0 0.2cqw 0.6cqw rgba(0,0,0,0.9)",
                    }}
                  >
                    ⚡
                  </span>
                );
              }

              // Active car card with durability
              const battlesLeft = typeof rawRemaining === "number"
                ? rawRemaining
                : (typeof rawMax === "number" ? rawMax : 6);
              const isLow = battlesLeft <= 2;

              return (
                <span
                  role="img"
                  aria-label={`${battlesLeft} battles remaining`}
                  title={`${battlesLeft} battles remaining`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "6.4cqw",
                    padding: "0.65cqw 1.8cqw",
                    borderRadius: "1.2cqw",
                    fontSize: "4.8cqw",
                    fontWeight: 900,
                    letterSpacing: "0.02em",
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                    background: isLow
                      ? "linear-gradient(135deg, rgba(180, 83, 9, 0.92), rgba(120, 53, 15, 0.92))"
                      : "rgba(0, 0, 0, 0.78)",
                    border: isLow
                      ? "0.35cqw solid #fcd34d"
                      : "0.35cqw solid #34d399",
                    color: isLow ? "#fef08a" : "#6ee7b7",
                    boxShadow: isLow
                      ? "0 0 2.5cqw rgba(245, 158, 11, 0.5), 0 0.6cqw 1cqw rgba(0,0,0,0.8)"
                      : "0 0 2cqw rgba(16, 185, 129, 0.35), 0 0.6cqw 1cqw rgba(0,0,0,0.8)",
                    textShadow: "0 0.2cqw 0.6cqw rgba(0,0,0,0.9)",
                  }}
                >
                  {battlesLeft}
                </span>
              );
            })()}
          </div>
        </div>

        {/* Text block */}
        <div style={{ ...abs({ left: "7cqw", right: "7cqw", bottom: "6.4cqw" }), color: "#fff", textShadow: "0 0.2cqw 0.9cqw rgba(0,0,0,0.95), 0 0 0.3cqw rgba(0,0,0,0.9)" }}>
          {(driver || team) && (
            <div style={{ fontSize: "3.6cqw", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.15, opacity: 0.95, marginBottom: "1.4cqw" }}>
              {driver && (
                <span style={{ opacity: card.driver.trim() ? 1 : 0.6 }}>
                  <span style={{ color: light }}>
                    {isTrack ? "Venue " : isDebuff ? "Hazard " : isCrew ? "Type " : isMaintenance ? "Kit " : "Driver "}
                  </span>
                  {driver}
                </span>
              )}
              {driver && team && <span style={{ color: accent }}> · </span>}
              {team && (
                <span style={{ opacity: card.team.trim() ? 1 : 0.6 }}>
                  {!isSpecialClashCard && <span style={{ color: light }}>Team </span>}
                  {team}
                </span>
              )}
            </div>
          )}

          {name && (
            <div style={{ fontSize: `${nameSize}cqw`, fontWeight: 800, textTransform: "uppercase", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", letterSpacing: "0.01em", opacity: card.name.trim() ? 1 : 0.6 }}>
              {name}
            </div>
          )}
          <div style={{ height: "0.7cqw", margin: "1.6cqw 0", background: isMythic ? "linear-gradient(90deg, #fff1b8, #ff2d55, #ffb020, #fff1b8)" : isLegend ? "linear-gradient(90deg, #7df9ff, #a78bfa, #ff7ad9, #ffd75e)" : `linear-gradient(90deg, ${light}, ${accent} 55%, transparent)`, borderRadius: "1cqw", boxShadow: `0 0 2cqw ${glow}aa` }} />
          {ability && (
            <div style={{ fontSize: "3.9cqw", fontWeight: 700, color: light, lineHeight: 1.1, opacity: card.ability.trim() ? 1 : 0.7, overflowWrap: "anywhere" }}>{ability}</div>
          )}
          {effect && (
            <div style={{ fontSize: "3.3cqw", fontWeight: 600, lineHeight: 1.15, marginTop: "0.8cqw", opacity: card.effect.trim() ? 0.92 : 0.55, overflowWrap: "anywhere" }}>{effect}</div>
          )}

          {/* Stats or Tactical Banner */}
          <div
            style={{
              marginTop: "2.4cqw",
              display: "flex",
              justifyContent: "space-around",
              alignItems: "center",
              padding: "1.6cqw 1cqw",
              borderRadius: "1.4cqw",
              background: "rgba(0,0,0,0.55)",
              border: `0.4cqw solid ${accent}`,
              boxShadow: `0 0 2.4cqw ${glow}66`,
            }}
          >
            {isSpecialClashCard ? (
              <span
                style={{
                  fontSize: "4.2cqw",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: pale,
                  whiteSpace: "nowrap",
                  textShadow: "none",
                }}
              >
                {(() => {
                  const resolvedIcon = card.crewIcon || getCrewCardDefinition(card.crewCardId || card.name)?.icon;
                  return resolvedIcon ? `${resolvedIcon} ` : isTrack ? "🏁 " : isDebuff ? "⚠️ " : isMaintenance ? "🛠️ " : "⚡ ";
                })()}
                {isTrack
                  ? "UK DRIFT TRACK · BUFF & DEBUFF"
                  : isDebuff
                    ? "CORNER HAZARD · BOTH DRIVERS"
                    : isMaintenance
                      ? ((card.repairBattles ?? 0) >= 5
                          ? "PIT REPAIR · INSTANT FULL FIX"
                          : `PIT REPAIR · -${card.repairBattles ?? 1} BATTLE${(card.repairBattles ?? 1) > 1 ? "S" : ""}`)
                      : "CREW ADVANTAGE · TANDEM CLASH"}
              </span>
            ) : (
              stats.map(([statLabel, value]) => (
                <span key={statLabel} style={{ fontSize: "4.8cqw", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em", color: accent, whiteSpace: "nowrap", textShadow: "none" }}>
                  {statLabel}: <span style={{ color: pale }}>{value.trim() || "__"}</span>
                </span>
              ))
            )}
          </div>
        </div>
      </div>
      {/* Mythic: molten lava border rendered in front of the card so the rim, drips and sparks sit on top of the frame. */}
      {isMythic && (
        <BorderEffects variant="mythic" seed={`${card.id ?? ""}|${card.name}|${card.imageUrl.slice(-24)}`} animated={!flat} />
      )}
    </div>
  );
}

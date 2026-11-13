"use client";
import { useEffect, useId, useRef } from "react";

/**
 * Large Elyperp "E" mark shaped like a thick coin.
 * Each cycle it faces the viewer for a moment (so the E reads clearly), then makes one fast
 * full turn and throws sparks off its edges. Both faces show a correctly-oriented E, and the
 * coin has real thickness, so it never disappears or reads mirrored mid-turn.
 * Sparks spawn from the rim, never across the face. Respects reduced-motion.
 */
const COLORS = ["#18d98b", "#2ef09d", "#7dffc4", "#c8ff6b", "#ffffff"];
const CYCLE_MS = 4200;
const HOLD = 0.5; // share of the cycle spent facing forward
const LAYERS = 10; // slices that make up the coin's thickness

const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/** Rotation (deg) and turning speed (0..1) at a point in the cycle. */
function pose(t: number) {
  if (t < HOLD) return { deg: Math.sin((t / HOLD) * Math.PI * 2) * 6, speed: 0 };
  const u = (t - HOLD) / (1 - HOLD);
  const d = 0.001;
  const speed = Math.min(1, ((easeInOut(Math.min(1, u + d)) - easeInOut(u)) / d) / 1.5);
  return { deg: easeInOut(u) * 360, speed };
}

function Face({ size, back }: { size: number; back?: boolean }) {
  // ids must be unique per instance: the page can render this logo more than once
  const uid = useId().replace(/:/g, "") + (back ? "b" : "f");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="absolute inset-0"
      style={{ transform: `${back ? "rotateY(180deg) " : ""}translateZ(${size * 0.06}px)`, backfaceVisibility: "hidden" }}
      aria-hidden
    >
      <defs>
        <linearGradient id={`ely-face-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14261d" />
          <stop offset="1" stopColor="#050806" />
        </linearGradient>
        <linearGradient id={`ely-ink-${uid}`} gradientUnits="userSpaceOnUse" x1="6" y1="6" x2="18" y2="18">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".45" stopColor="#7dffc4" />
          <stop offset="1" stopColor="#18d98b" />
        </linearGradient>
      </defs>
      <rect x="0.8" y="0.8" width="22.4" height="22.4" rx="5.2" fill={`url(#ely-face-${uid})`} stroke="#18d98b" strokeWidth=".9" />
      <rect x="2.1" y="2.1" width="19.8" height="19.8" rx="4.2" fill="none" stroke="#18d98b" strokeOpacity=".25" strokeWidth=".4" />
      {/* the E: three bars (userSpaceOnUse: a gradient sized to a flat line's box would draw nothing) */}
      <g stroke={`url(#ely-ink-${uid})`} strokeWidth="2.9" strokeLinecap="round">
        <path d="M6.6 6.8h10.4" />
        <path d="M6.6 12h7.2" />
        <path d="M6.6 17.2h10.4" />
      </g>
      <path d="M16.4 9.9 19.2 12l-2.8 2.1" stroke="#c8ff6b" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AnimatedLogo({ size = 168 }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coinRef = useRef<HTMLDivElement>(null);
  const box = Math.round(size * 2.3);
  const depth = size * 0.12;

  useEffect(() => {
    const canvas = canvasRef.current;
    const coin = coinRef.current;
    if (!canvas || !coin) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = box * dpr;
    canvas.height = box * dpr;
    ctx.scale(dpr, dpr);

    type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string };
    const sparks: Spark[] = [];
    const c = box / 2;
    const half = size / 2;
    let raf = 0;
    let last = performance.now();
    let visible = true;
    let wasSpinning = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);

    const spark = (x: number, y: number, ang: number, v: number) => {
      const max = 28 + Math.random() * 42;
      sparks.push({
        x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, life: max, max,
        size: 0.9 + Math.random() * 2.2, color: COLORS[(Math.random() * COLORS.length) | 0],
      });
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min(3, (now - last) / 16.67);
      last = now;
      const { deg, speed } = pose((now % CYCLE_MS) / CYCLE_MS);
      coin.style.transform = `rotateY(${deg}deg)`;

      // edge sparks while turning: from the left/right rim of the coin as it's seen right now
      const rad = (deg * Math.PI) / 180;
      const edge = Math.abs(Math.cos(rad)) * half + Math.abs(Math.sin(rad)) * depth;
      const n = Math.round(speed * 7 * dt);
      for (let i = 0; i < n; i++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const y = c + (Math.random() - 0.5) * size * 0.95;
        const ang = (side > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.1;
        spark(c + side * (edge + 2), y, ang, 1.2 + Math.random() * 3.2 * (0.5 + speed));
      }
      // a ring burst as each turn finishes
      const spinning = speed > 0.02;
      if (wasSpinning && !spinning) {
        for (let i = 0; i < 46; i++) {
          const a = (i / 46) * Math.PI * 2 + Math.random() * 0.1;
          spark(c + Math.cos(a) * half * 1.1, c + Math.sin(a) * half * 1.1, a, 1.5 + Math.random() * 2.5);
        }
      }
      wasSpinning = spinning;
      // a few slow embers from the outer ring the rest of the time, kept clear of the face
      if (Math.random() < 0.25 * dt) {
        const a = Math.random() * Math.PI * 2;
        spark(c + Math.cos(a) * half * 1.25, c + Math.sin(a) * half * 1.25, a, 0.4 + Math.random() * 0.8);
      }

      ctx.clearRect(0, 0, box, box);
      ctx.globalCompositeOperation = "lighter";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life -= dt;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        s.vx *= 0.975;
        s.vy = s.vy * 0.975 + 0.025 * dt;
        const px = s.x;
        const py = s.y;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const a = s.life / s.max;
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = a * 0.75;
        ctx.lineWidth = s.size * 0.8;
        ctx.beginPath();
        ctx.moveTo(px - s.vx * 2.5, py - s.vy * 2.5);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
        ctx.globalAlpha = a;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * a + 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
      if (sparks.length > 700) sparks.splice(0, sparks.length - 700);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [box, size, depth]);

  return (
    <div className="relative grid place-items-center" style={{ width: box, height: box }} aria-label="Elyperp" role="img">
      <div className="absolute rounded-full ely-glow" style={{ width: size * 1.7, height: size * 1.7 }} />
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ width: box, height: box }} />
      <div style={{ width: size, height: size, perspective: size * 6 }}>
        <div ref={coinRef} className="relative ely-coin" style={{ width: size, height: size, transformStyle: "preserve-3d" }}>
          {/* thickness: stacked slices between the two faces */}
          {Array.from({ length: LAYERS }, (_, i) => {
            const z = -depth / 2 + (depth * i) / (LAYERS - 1);
            return (
              <div
                key={i}
                className="absolute inset-0"
                style={{
                  transform: `translateZ(${z * 0.9}px)`,
                  borderRadius: size * 0.22,
                  background: i % 2 ? "#0f9f66" : "#0c7f52",
                  boxShadow: "0 0 0 1px rgba(24,217,139,.35)",
                }}
              />
            );
          })}
          <Face size={size} />
          <Face size={size} back />
        </div>
      </div>
    </div>
  );
}

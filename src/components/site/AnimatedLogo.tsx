"use client";
import { useEffect, useRef } from "react";

/**
 * Large Elyperp mark that turns in 3D and throws off sparks while it spins.
 * Sparks are drawn on a canvas behind the mark. Respects reduced-motion.
 */
const COLORS = ["#18d98b", "#2ef09d", "#7dffc4", "#c8ff6b", "#ffffff"];

export function AnimatedLogo({ size = 168 }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const box = Math.round(size * 2.2);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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
    const r = size * 0.52;
    const SPIN_MS = 3600; // must match the CSS animation below
    let raf = 0;
    let last = performance.now();
    let visible = true;

    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);

    const emit = (now: number) => {
      // The mark turns around its vertical axis. Its edges move fastest when it faces the viewer,
      // so sparks fly hardest from the left and right edges at those moments.
      const phase = ((now % SPIN_MS) / SPIN_MS) * Math.PI * 2;
      const speed = Math.abs(Math.cos(phase));
      const count = 1 + Math.round(speed * 4);
      for (let i = 0; i < count; i++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const width = Math.abs(Math.cos(phase)) * r;
        const y = c + (Math.random() - 0.5) * r * 1.7;
        const x = c + side * width;
        const ang = (side > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.3;
        const v = 0.6 + Math.random() * 2.4 * (0.4 + speed);
        const max = 30 + Math.random() * 40;
        sparks.push({
          x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 0.3, life: max, max,
          size: 0.8 + Math.random() * 2.2, color: COLORS[(Math.random() * COLORS.length) | 0],
        });
      }
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min(3, (now - last) / 16.67);
      last = now;
      emit(now);
      ctx.clearRect(0, 0, box, box);
      ctx.globalCompositeOperation = "lighter";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life -= dt;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        s.vx *= 0.985;
        s.vy = s.vy * 0.985 + 0.02 * dt;
        const px = s.x;
        const py = s.y;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const a = s.life / s.max;
        // short streak plus a glowing head
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = a * 0.7;
        ctx.lineWidth = s.size * 0.8;
        ctx.beginPath();
        ctx.moveTo(px - s.vx * 2, py - s.vy * 2);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
        ctx.globalAlpha = a;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * a + 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
      if (sparks.length > 600) sparks.splice(0, sparks.length - 600);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [box, size]);

  return (
    <div className="relative grid place-items-center" style={{ width: box, height: box }} aria-label="Elyperp" role="img">
      {/* soft pulsing glow */}
      <div className="absolute rounded-full ely-glow" style={{ width: size * 1.5, height: size * 1.5 }} />
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ width: box, height: box }} />
      <div className="ely-stage" style={{ width: size, height: size }}>
        <svg className="ely-spin" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <defs>
            <linearGradient id="ely-face" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#13221b" />
              <stop offset="1" stopColor="#070b09" />
            </linearGradient>
            <linearGradient id="ely-stroke" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#7dffc4" />
              <stop offset=".5" stopColor="#18d98b" />
              <stop offset="1" stopColor="#c8ff6b" />
            </linearGradient>
          </defs>
          <rect x="1" y="1" width="22" height="22" rx="5" fill="url(#ely-face)" stroke="url(#ely-stroke)" strokeWidth=".7" />
          <path d="M7 7h10M7 12h7M7 17h10" stroke="url(#ely-stroke)" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M16.5 10.2 19 12l-2.5 1.8" stroke="#c8ff6b" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

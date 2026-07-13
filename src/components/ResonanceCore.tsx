import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTether } from "../context/TetherContext";
import { haptic } from "../lib/haptics";

/**
 * The Resonance Core — the couple's living entity. Heat (0–100, decaying
 * 2/hour) maps directly onto its body:
 *   cold  → crystallized: slow, angular, dim charcoal/slate
 *   warm  → fluid: fast, round, glowing burgundy → amber
 * Tap it to pulse. Press and hold — if your partner holds theirs at the
 * same moment, the Core resonates: it swells and both phones share one
 * synchronized heartbeat.
 */

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function heatPalette(h: number): { inner: string; outer: string; glow: string } {
  const t = h / 100;
  // charcoal-slate → burgundy → warm amber-rose
  const mix = (c1: number[], c2: number[], k: number) =>
    `rgb(${Math.round(lerp(c1[0], c2[0], k))},${Math.round(lerp(c1[1], c2[1], k))},${Math.round(
      lerp(c1[2], c2[2], k),
    )})`;
  const coldIn = [74, 80, 94];
  const warmIn = [198, 90, 130];
  const coldOut = [34, 38, 48];
  const warmOut = [122, 34, 68];
  return {
    inner: mix(coldIn, warmIn, t),
    outer: mix(coldOut, warmOut, t),
    glow: `rgba(${Math.round(lerp(110, 244, t))},${Math.round(lerp(120, 166, t))},${Math.round(
      lerp(140, 189, t),
    )},${lerp(0.12, 0.4, t)})`,
  };
}

/** Blob keyframes whose "wobble" amplitude grows with heat. */
function blobFrames(h: number): string[] {
  const amp = lerp(3, 16, h / 100); // % deviation from a circle
  const r = (seed: number) => 50 + Math.sin(seed) * amp;
  const frame = (s: number) =>
    `${r(s)}% ${100 - r(s + 1)}% ${r(s + 2)}% ${100 - r(s + 3)}% / ${r(s + 4)}% ${r(s + 5)}% ${
      100 - r(s + 6)
    }% ${r(s + 7)}%`;
  return [frame(1), frame(3), frame(5), frame(1)];
}

const TAP_MS = 280;

export default function ResonanceCore({ onTap }: { onTap: () => void }) {
  const { heat, broadcast, onBroadcast, addHeat, ambience } = useTether();
  const [partnerHolding, setPartnerHolding] = useState(false);
  const [holding, setHolding] = useState(false);
  const [resonating, setResonating] = useState(false);
  const downAtRef = useRef(0);
  const resonatedRef = useRef(false);

  useEffect(
    () =>
      onBroadcast("core_touch", (p) => {
        setPartnerHolding(!!p.down);
      }),
    [onBroadcast],
  );

  // both hands on the core at once → resonance
  useEffect(() => {
    if (holding && partnerHolding && !resonatedRef.current) {
      resonatedRef.current = true;
      setResonating(true);
      haptic("pulse");
      addHeat(6);
      const t = setTimeout(() => setResonating(false), 1800);
      return () => clearTimeout(t);
    }
    if (!holding || !partnerHolding) resonatedRef.current = false;
  }, [holding, partnerHolding, addHeat]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    downAtRef.current = Date.now();
    setHolding(true);
    broadcast("core_touch", { down: true });
    haptic("light");
  };

  const onPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    setHolding(false);
    broadcast("core_touch", { down: false });
    if (Date.now() - downAtRef.current < TAP_MS) onTap();
  };

  const palette = heatPalette(heat);
  const duration = lerp(14, 3.2, heat / 100); // crystallized = near-still
  const cold = heat < 20;

  return (
    <div className="relative flex items-center justify-center">
      {/* resonance shockwave */}
      {resonating && (
        <motion.div
          className="absolute rounded-full border border-blush/60"
          initial={{ width: 190, height: 190, opacity: 0.9 }}
          animate={{ width: 620, height: 620, opacity: 0 }}
          transition={{ duration: 1.6, ease: "easeOut" }}
        />
      )}

      <motion.button
        aria-label="The Resonance Core — tap to pulse, hold together to resonate"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: "none" }}
        className="pointer-events-auto relative h-48 w-48"
        animate={{
          scale: resonating ? [1, 1.22, 1.05] : holding ? 1.06 : [1, cold ? 1.015 : 1.06, 1],
        }}
        transition={
          resonating
            ? { duration: 1.2, ease: "easeOut" }
            : holding
              ? { duration: 0.3 }
              : { duration, repeat: Infinity, ease: "easeInOut" }
        }
      >
        <motion.span
          className="absolute inset-0 block"
          animate={{
            borderRadius: blobFrames(heat),
            rotate: [0, cold ? 3 : 24, 0],
            background: `radial-gradient(circle at 36% 30%, ${palette.inner} 0%, ${palette.outer} 68%, rgba(11,6,10,0.9) 100%)`,
            boxShadow: `0 0 ${lerp(30, 110, heat / 100)}px ${lerp(6, 34, heat / 100)}px ${palette.glow}`,
            filter: `saturate(${lerp(0.55, 1.15, heat / 100)})`,
          }}
          transition={{
            borderRadius: { duration, repeat: Infinity, ease: "easeInOut" },
            rotate: { duration: duration * 1.6, repeat: Infinity, ease: "easeInOut" },
            background: { duration: 2.5 },
            boxShadow: { duration: 2.5 },
            filter: { duration: 2.5 },
          }}
        />
        {/* crystal facets emerge as the core goes cold */}
        {cold && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            className="absolute inset-0 block"
            style={{
              borderRadius: "42% 58% 45% 55% / 48% 44% 56% 52%",
              background:
                "conic-gradient(from 30deg, transparent 0deg, rgba(160,170,190,0.18) 24deg, transparent 60deg, rgba(160,170,190,0.12) 130deg, transparent 180deg, rgba(160,170,190,0.16) 260deg, transparent 320deg)",
            }}
          />
        )}
      </motion.button>

      {/* whisper of state under the core */}
      <p className="pointer-events-none absolute -bottom-7 text-[11px] text-muted">
        {resonating
          ? "resonating"
          : holding && !partnerHolding
            ? ambience === "dormant"
              ? "holding — they're not here"
              : "holding — waiting for their hand"
            : heat < 20
              ? "the core has gone cold"
              : heat < 55
                ? "the core is warm"
                : "the core is thriving"}
      </p>
    </div>
  );
}

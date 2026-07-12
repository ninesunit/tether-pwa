import { motion } from "framer-motion";
import { useTether, type Ambience } from "../context/TetherContext";

/**
 * The living background. A blurred mesh of soft radial blobs that slowly
 * drift, whose palette answers the partner's presence:
 *   dormant → cold charcoal/slate, present → warm amber, near → glowing blush.
 */
const palettes: Record<Ambience, [string, string, string]> = {
  dormant: ["#1c1a24", "#141820", "#0f0d14"],
  present: ["#5c3318", "#6e1e3c", "#2a1410"],
  near: ["#8a2c50", "#c2703a", "#4a1a30"],
};

const blobs = [
  { size: "70vmax", x: "-15%", y: "-20%", dur: 26 },
  { size: "60vmax", x: "55%", y: "45%", dur: 34 },
  { size: "50vmax", x: "10%", y: "65%", dur: 30 },
];

export default function AmbientBackground() {
  const { ambience } = useTether();
  const colors = palettes[ambience];

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-void">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: b.size,
            height: b.size,
            left: b.x,
            top: b.y,
            filter: "blur(90px)",
            opacity: 0.55,
          }}
          animate={{
            backgroundColor: colors[i],
            x: ["0%", "8%", "-6%", "0%"],
            y: ["0%", "-7%", "5%", "0%"],
          }}
          transition={{
            backgroundColor: { duration: 3.5, ease: "easeInOut" },
            x: { duration: b.dur, repeat: Infinity, ease: "easeInOut" },
            y: { duration: b.dur * 1.2, repeat: Infinity, ease: "easeInOut" },
          }}
        />
      ))}
      {/* fine grain of darkness so content always stays readable */}
      <div className="absolute inset-0 bg-void/40" />
    </div>
  );
}

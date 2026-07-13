import { motion } from "framer-motion";
import { useTether, type Ambience } from "../context/TetherContext";
import { moodColor } from "../lib/types";

/**
 * The living background. A blurred mesh of soft radial blobs that slowly
 * drift, whose palette answers the partner's presence:
 *   dormant → cold charcoal/slate, present → warm amber, near → glowing blush.
 * A fourth blob always carries the couple's shared mood color.
 */
const palettes: Record<Ambience, [string, string, string]> = {
  dormant: ["#1e1b26", "#151922", "#100e16"],
  present: ["#61361a", "#7a2244", "#2c1511"],
  near: ["#92305a", "#c2703a", "#4e1c33"],
};

const blobs = [
  { size: "70vmax", x: "-15%", y: "-20%", dur: 26 },
  { size: "60vmax", x: "55%", y: "45%", dur: 34 },
  { size: "50vmax", x: "10%", y: "65%", dur: 30 },
];

export default function AmbientBackground() {
  const { ambience, mood } = useTether();
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
      {/* the shared mood, breathing at the horizon */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: "80vmax",
          height: "40vmax",
          left: "10%",
          bottom: "-25vmax",
          filter: "blur(110px)",
        }}
        animate={{ backgroundColor: moodColor(mood), opacity: [0.14, 0.22, 0.14] }}
        transition={{
          backgroundColor: { duration: 3 },
          opacity: { duration: 9, repeat: Infinity, ease: "easeInOut" },
        }}
      />
      {/* fine grain of darkness so content always stays readable */}
      <div className="absolute inset-0 bg-void/45" />
    </div>
  );
}

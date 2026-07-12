import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTether } from "../context/TetherContext";

/**
 * The heart of the app: one large breathing orb. Tap it to send a pulse.
 * Incoming pulses ripple outward and shake the Taptic Engine.
 */
export default function PulseScreen() {
  const { sendPulse, lastPulseAt, ambience, profile } = useTether();
  const [ripples, setRipples] = useState<number[]>([]);
  const [sentAt, setSentAt] = useState<number | null>(null);

  // Incoming pulse → ripple.
  useEffect(() => {
    if (!lastPulseAt) return;
    setRipples((r) => [...r.slice(-4), lastPulseAt]);
  }, [lastPulseAt]);

  const onTap = () => {
    sendPulse();
    setSentAt(Date.now());
    setRipples((r) => [...r.slice(-4), Date.now()]);
  };

  const statusText =
    ambience === "near"
      ? "they're right here"
      : ambience === "present"
        ? "they're here with you"
        : "the line is quiet";

  return (
    <div className="relative flex h-full flex-col items-center justify-center">
      <p className="absolute top-20 text-sm tracking-wide text-muted safe-top">
        {profile?.display_name ? `hi, ${profile.display_name.toLowerCase()}` : ""}
      </p>

      <div className="relative flex items-center justify-center">
        {/* outward ripples */}
        <AnimatePresence>
          {ripples.map((id) => (
            <motion.div
              key={id}
              className="absolute rounded-full border border-blush/50"
              initial={{ width: 176, height: 176, opacity: 0.8 }}
              animate={{ width: 560, height: 560, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.4, ease: "easeOut" }}
              onAnimationComplete={() => setRipples((r) => r.filter((x) => x !== id))}
            />
          ))}
        </AnimatePresence>

        {/* the orb — breathes slowly; faster & warmer when partner present */}
        <motion.button
          onTap={onTap}
          whileTap={{ scale: 0.92 }}
          className="relative h-44 w-44 rounded-full"
          animate={{
            scale: [1, ambience === "dormant" ? 1.04 : 1.08, 1],
            boxShadow:
              ambience === "near"
                ? "0 0 120px 30px rgba(232,164,184,0.35)"
                : ambience === "present"
                  ? "0 0 90px 20px rgba(240,180,106,0.25)"
                  : "0 0 60px 10px rgba(110,30,60,0.25)",
          }}
          transition={{
            duration: ambience === "dormant" ? 5 : 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            background:
              "radial-gradient(circle at 35% 30%, #a94063 0%, #6e1e3c 55%, #3a1a28 100%)",
          }}
          aria-label="Send a pulse"
        />
      </div>

      <div className="absolute bottom-32 text-center safe-bottom">
        <AnimatePresence mode="wait">
          <motion.p
            key={sentAt && Date.now() - sentAt < 3000 ? "sent" : statusText}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="text-sm text-muted"
          >
            {sentAt && Date.now() - sentAt < 3000 ? "sent, softly" : statusText}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

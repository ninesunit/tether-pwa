import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Armchair } from "lucide-react";
import { useTether } from "../context/TetherContext";
import { MOODS } from "../lib/types";
import { startAmbience, stopAmbience } from "../lib/ambience";
import ResonanceCore from "../components/ResonanceCore";
import TetherLine from "../components/TetherLine";

/**
 * Home. The Resonance Core breathes at the center with the Tether Line
 * strung across it. Tap the core to pulse; hold it together to resonate;
 * pull the line to tug at your partner's hands.
 */
export default function PulseScreen() {
  const {
    sendPulse,
    lastPulseAt,
    ambience,
    profile,
    partnerProfile,
    mood,
    moodSetByPartner,
    setMood,
    together,
    bothTogether,
    setTogether,
  } = useTether();
  const [ripples, setRipples] = useState<number[]>([]);
  const [sentAt, setSentAt] = useState<number | null>(null);

  useEffect(() => {
    if (!lastPulseAt) return;
    setRipples((r) => [...r.slice(-4), lastPulseAt]);
  }, [lastPulseAt]);

  // shared soundscape only plays while you're actually sitting together
  useEffect(() => {
    if (bothTogether) startAmbience();
    else stopAmbience();
    return () => stopAmbience();
  }, [bothTogether]);

  const onCoreTap = () => {
    sendPulse();
    setSentAt(Date.now());
    setRipples((r) => [...r.slice(-4), Date.now()]);
  };

  const partnerName = partnerProfile?.display_name ?? "them";
  const statusText = bothTogether
    ? "sitting together"
    : ambience === "near"
      ? `${partnerName} is right here`
      : ambience === "present"
        ? `${partnerName} is here with you`
        : "the line is quiet";

  return (
    <div className="relative flex h-full flex-col items-center px-6 safe-top">
      {/* the geographic tether — spans the whole screen, aimed at them */}
      <TetherLine />

      {/* header */}
      <div className="z-10 mt-16 w-full">
        <p className="text-sm text-muted">
          {profile?.display_name ? `hi, ${profile.display_name.toLowerCase()}` : ""}
        </p>
      </div>

      {/* partner chip */}
      <div className="glass z-10 mt-3 flex items-center gap-2.5 rounded-full px-4 py-2">
        <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-burgundy/70 font-serif text-sm text-blush">
          {partnerName.charAt(0).toUpperCase()}
          <motion.span
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-ember-950"
            animate={{
              backgroundColor:
                ambience === "dormant" ? "#5a4a55" : ambience === "present" ? "#f2b263" : "#f4a6bd",
            }}
          />
        </span>
        <span className="text-sm text-cream/90">{statusText}</span>
      </div>

      {/* the core, ringed by incoming ripples */}
      <div className="pointer-events-none relative z-10 flex w-full flex-1 flex-col items-center justify-center">
        <AnimatePresence>
          {ripples.map((id) => (
            <motion.div
              key={id}
              className="pointer-events-none absolute rounded-full border border-blush/50"
              initial={{ width: 190, height: 190, opacity: 0.8 }}
              animate={{ width: 560, height: 560, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.4, ease: "easeOut" }}
              onAnimationComplete={() => setRipples((r) => r.filter((x) => x !== id))}
            />
          ))}
        </AnimatePresence>

        <ResonanceCore onTap={onCoreTap} />
      </div>

      {/* sent feedback + mood + together */}
      <div className="z-10 mb-28 w-full space-y-4">
        <AnimatePresence>
          {sentAt && Date.now() - sentAt < 3000 && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center text-sm text-blush-soft"
            >
              sent, softly
            </motion.p>
          )}
        </AnimatePresence>

        <div>
          <p className="eyebrow text-center">
            {moodSetByPartner ? `${partnerName} set today's mood` : "today feels"}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {MOODS.map((m) => (
              <motion.button
                key={m.key}
                whileTap={{ scale: 0.93 }}
                onClick={() => setMood(m.key)}
                className={`rounded-full px-3.5 py-1.5 text-xs transition-colors ${
                  mood === m.key ? "text-void" : "glass text-cream/80"
                }`}
                style={mood === m.key ? { backgroundColor: m.color } : undefined}
              >
                {m.label}
              </motion.button>
            ))}
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => setTogether(!together)}
          className={`mx-auto flex items-center gap-2 rounded-full px-5 py-2.5 text-sm transition-colors ${
            together ? "btn-warm text-cream" : "glass text-muted"
          }`}
        >
          <Armchair size={15} />
          {bothTogether
            ? "you're sitting together"
            : together
              ? "waiting on the bench…"
              : "sit together"}
        </motion.button>
      </div>
    </div>
  );
}

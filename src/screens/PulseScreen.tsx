import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings2, Armchair } from "lucide-react";
import { useTether } from "../context/TetherContext";
import { MOODS, moodColor } from "../lib/types";
import { startAmbience, stopAmbience } from "../lib/ambience";
import SettingsSheet from "../components/SettingsSheet";

/**
 * The heart of the app: one large breathing orb ringed by the shared mood.
 * Tap to send a pulse; hold the bench to "sit together" in a shared
 * soundscape when you're both here.
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
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  const onTap = () => {
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
      {/* header */}
      <div className="mt-16 flex w-full items-center justify-between">
        <p className="text-sm text-muted">
          {profile?.display_name ? `hi, ${profile.display_name.toLowerCase()}` : ""}
        </p>
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="settings"
          className="glass flex h-9 w-9 items-center justify-center rounded-full"
        >
          <Settings2 size={16} className="text-muted" />
        </button>
      </div>

      {/* partner chip */}
      <div className="glass mt-4 flex items-center gap-2.5 rounded-full px-4 py-2">
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

      {/* the orb */}
      <div className="relative flex flex-1 items-center justify-center">
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

        {/* mood ring */}
        <motion.div
          className="absolute h-56 w-56 rounded-full"
          style={{ border: "1.5px solid" }}
          animate={{
            borderColor: moodColor(mood),
            opacity: [0.25, 0.5, 0.25],
            scale: [1, 1.05, 1],
          }}
          transition={{
            borderColor: { duration: 2 },
            opacity: { duration: 6, repeat: Infinity, ease: "easeInOut" },
            scale: { duration: 6, repeat: Infinity, ease: "easeInOut" },
          }}
        />

        <motion.button
          onTap={onTap}
          whileTap={{ scale: 0.92 }}
          className="relative h-44 w-44 rounded-full"
          animate={{
            scale: [1, ambience === "dormant" ? 1.04 : 1.08, 1],
            boxShadow:
              ambience === "near"
                ? "0 0 120px 30px rgba(244,166,189,0.35)"
                : ambience === "present"
                  ? "0 0 90px 20px rgba(242,178,99,0.25)"
                  : "0 0 60px 10px rgba(122,34,68,0.25)",
          }}
          transition={{
            duration: ambience === "dormant" ? 5 : 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            background:
              "radial-gradient(circle at 35% 30%, #b34a6e 0%, #7a2244 55%, #3c1c2c 100%)",
          }}
          aria-label="Send a pulse"
        />
      </div>

      {/* sent feedback + mood + together */}
      <div className="mb-28 w-full space-y-5">
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

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

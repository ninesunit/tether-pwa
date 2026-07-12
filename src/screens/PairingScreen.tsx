import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTether } from "../context/TetherContext";
import { haptic } from "../lib/haptics";

export default function PairingScreen() {
  const { tether, createTether, joinTether, signOut } = useTether();
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onCreate = async () => {
    setBusy(true);
    haptic("light");
    await createTether();
    setBusy(false);
  };

  const onJoin = async () => {
    setBusy(true);
    setError(null);
    haptic("light");
    const err = await joinTether(joinCode);
    if (err) setError(err);
    else haptic("success");
    setBusy(false);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-10 safe-top safe-bottom">
      <AnimatePresence mode="wait">
        {tether ? (
          /* Waiting for the partner to enter the code. */
          <motion.div
            key="waiting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center"
          >
            <p className="text-sm text-muted">your tether code</p>
            <motion.p
              className="mt-6 font-serif text-5xl tracking-[0.15em] text-amber-glow"
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              {tether.code}
            </motion.p>
            <p className="mx-auto mt-10 max-w-60 text-sm leading-relaxed text-muted">
              share this with your person. the moment they enter it, you're tethered.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="choose"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-sm space-y-10"
          >
            <div className="text-center">
              <h2 className="font-serif text-2xl text-cream">find each other</h2>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              disabled={busy}
              onClick={onCreate}
              className="w-full rounded-2xl bg-burgundy py-4 text-cream"
            >
              create a tether code
            </motion.button>

            <div className="flex items-center gap-4 text-muted">
              <div className="h-px flex-1 bg-ember-800" />
              <span className="text-xs">or</span>
              <div className="h-px flex-1 bg-ember-800" />
            </div>

            <div className="space-y-4">
              <input
                className="w-full rounded-2xl bg-ember-900/70 px-5 py-4 text-center uppercase tracking-[0.2em] text-cream placeholder-muted outline-none"
                placeholder="ENTER CODE"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                autoCapitalize="characters"
                autoCorrect="off"
              />
              {error && <p className="text-center text-sm text-blush">{error}</p>}
              <motion.button
                whileTap={{ scale: 0.97 }}
                disabled={busy || joinCode.trim().length < 4}
                onClick={onJoin}
                className="w-full rounded-2xl bg-ember-800 py-4 text-cream disabled:opacity-40"
              >
                tether us
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button onClick={signOut} className="absolute bottom-10 text-xs text-muted safe-bottom">
        sign out
      </button>
    </div>
  );
}

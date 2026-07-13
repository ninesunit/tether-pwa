import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check } from "lucide-react";
import { useTether } from "../context/TetherContext";
import { haptic } from "../lib/haptics";

export default function PairingScreen() {
  const { tether, createTether, joinTether, signOut } = useTether();
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const onCreate = async () => {
    setBusy(true);
    setError(null);
    haptic("light");
    const err = await createTether();
    if (err) setError(err);
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

  const copyCode = async () => {
    if (!tether) return;
    try {
      await navigator.clipboard.writeText(tether.code);
      setCopied(true);
      haptic("light");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — code is on screen anyway */
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-9 safe-top safe-bottom">
      <AnimatePresence mode="wait">
        {tether ? (
          /* Waiting for the partner to enter the code. */
          <motion.div
            key="waiting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-sm text-center"
          >
            {/* two orbs drifting toward each other */}
            <div className="relative mx-auto h-20 w-40">
              <motion.span
                className="absolute top-1/2 h-10 w-10 -translate-y-1/2 rounded-full"
                style={{ background: "radial-gradient(circle at 35% 30%, #c65a82, #7a2244)" }}
                animate={{ left: ["8%", "26%", "8%"] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.span
                className="absolute top-1/2 h-10 w-10 -translate-y-1/2 rounded-full opacity-70"
                style={{ background: "radial-gradient(circle at 35% 30%, #f2b263, #8a5a2a)" }}
                animate={{ right: ["8%", "26%", "8%"] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>

            <p className="eyebrow mt-6">your tether code</p>
            <div className="glass mt-4 rounded-3xl px-6 py-7">
              <motion.p
                className="text-glow font-serif text-4xl tracking-[0.14em] text-amber-glow"
                animate={{ opacity: [0.75, 1, 0.75] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                {tether.code}
              </motion.p>
              <button
                onClick={copyCode}
                className="mx-auto mt-4 flex items-center gap-1.5 text-xs text-muted"
              >
                {copied ? <Check size={13} className="text-blush" /> : <Copy size={13} />}
                {copied ? "copied" : "copy code"}
              </button>
            </div>
            <p className="mx-auto mt-6 max-w-64 text-sm leading-relaxed text-muted">
              share this with your person. the moment they enter it, you're tethered — this screen
              will change on its own.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="choose"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-sm space-y-9"
          >
            <div className="text-center">
              <h2 className="text-glow font-serif text-3xl text-cream">find each other</h2>
              <p className="mt-2 text-sm text-muted">one of you creates a code. the other enters it.</p>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              disabled={busy}
              onClick={onCreate}
              className="btn-warm w-full rounded-2xl py-4 text-cream disabled:opacity-50"
            >
              create a tether code
            </motion.button>

            <div className="flex items-center gap-4 text-muted">
              <div className="h-px flex-1 bg-blush/10" />
              <span className="text-xs">or</span>
              <div className="h-px flex-1 bg-blush/10" />
            </div>

            <div className="space-y-3.5">
              <input
                className="field w-full rounded-2xl px-5 py-4 text-center font-serif text-xl uppercase tracking-[0.2em] text-cream placeholder-muted outline-none placeholder:font-sans placeholder:text-sm placeholder:tracking-normal"
                placeholder="enter their code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect="off"
              />
              <motion.button
                whileTap={{ scale: 0.97 }}
                disabled={busy || joinCode.trim().length < 4}
                onClick={onJoin}
                className="glass w-full rounded-2xl py-4 text-cream disabled:opacity-40"
              >
                {busy ? "…" : "tether us"}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {error && (
        <p className="mt-6 max-w-sm text-center text-sm text-blush">{error}</p>
      )}
      <button onClick={signOut} className="absolute bottom-10 text-xs text-muted safe-bottom">
        sign out
      </button>
    </div>
  );
}

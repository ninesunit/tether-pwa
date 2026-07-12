import { useState } from "react";
import { motion } from "framer-motion";
import { useTether } from "../context/TetherContext";
import { haptic } from "../lib/haptics";

export default function AuthScreen() {
  const { signIn, signUp } = useTether();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    haptic("light");
    const err =
      mode === "in" ? await signIn(email, password) : await signUp(email, password, name);
    if (err) setError(err);
    setBusy(false);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-10 safe-top safe-bottom">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className="w-full max-w-sm"
      >
        <h1 className="font-serif text-4xl tracking-wide text-cream">tether</h1>
        <p className="mt-2 text-sm text-muted">a quiet space for two.</p>

        <div className="mt-12 space-y-4">
          {mode === "up" && (
            <input
              className="w-full rounded-2xl bg-ember-900/70 px-5 py-4 text-cream placeholder-muted outline-none focus:bg-ember-800/70 transition-colors"
              placeholder="your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="given-name"
            />
          )}
          <input
            className="w-full rounded-2xl bg-ember-900/70 px-5 py-4 text-cream placeholder-muted outline-none focus:bg-ember-800/70 transition-colors"
            placeholder="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            className="w-full rounded-2xl bg-ember-900/70 px-5 py-4 text-cream placeholder-muted outline-none focus:bg-ember-800/70 transition-colors"
            placeholder="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
          />
          {error && <p className="px-1 text-sm text-blush">{error}</p>}
          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={busy || !email || !password || (mode === "up" && !name)}
            onClick={submit}
            className="w-full rounded-2xl bg-burgundy py-4 font-medium text-cream disabled:opacity-40 transition-opacity"
          >
            {busy ? "…" : mode === "in" ? "come in" : "begin"}
          </motion.button>
        </div>

        <button
          className="mt-8 w-full text-center text-sm text-muted"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
        >
          {mode === "in" ? "first time here? create your half" : "already have a half? sign in"}
        </button>
      </motion.div>
    </div>
  );
}

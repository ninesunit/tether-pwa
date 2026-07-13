import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Heart } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useTether } from "../context/TetherContext";
import { haptic } from "../lib/haptics";
import type { Goal } from "../lib/types";

/**
 * Tethered Path — cooperative micro-goals with one shared progress bar.
 * Either partner advances it; increments are atomic via RPC. A cheer
 * button sends encouragement straight to the partner's hands.
 */
export default function PathScreen() {
  const { tether, sendCheer } = useTether();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("8");
  const [cheeredId, setCheeredId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tether) return;
    const { data } = await supabase
      .from("goals")
      .select("*")
      .eq("tether_id", tether.id)
      .order("created_at", { ascending: false });
    setGoals((data as Goal[]) ?? []);
  }, [tether]);

  useEffect(() => {
    load();
    if (!tether) return;
    const ch = supabase
      .channel(`goals:${tether.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "goals", filter: `tether_id=eq.${tether.id}` },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setGoals((gs) =>
              gs.map((g) => (g.id === (payload.new as Goal).id ? (payload.new as Goal) : g)),
            );
            haptic("light");
          } else load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tether, load]);

  const add = async () => {
    if (!tether || !title.trim()) return;
    haptic("light");
    await supabase.from("goals").insert({
      tether_id: tether.id,
      title: title.trim(),
      target: Math.max(1, parseInt(target) || 1),
    });
    setTitle("");
    setTarget("8");
    setAdding(false);
  };

  const increment = async (g: Goal) => {
    if (g.progress >= g.target) return;
    const done = g.progress + 1 >= g.target;
    haptic(done ? "success" : "medium");
    // optimistic
    setGoals((gs) =>
      gs.map((x) => (x.id === g.id ? { ...x, progress: Math.min(x.target, x.progress + 1) } : x)),
    );
    await supabase.rpc("increment_goal", { goal_id: g.id, amount: 1 });
  };

  const cheer = (g: Goal) => {
    sendCheer(g.title);
    setCheeredId(g.id);
    setTimeout(() => setCheeredId(null), 2200);
  };

  return (
    <div className="h-full overflow-y-auto px-6 pb-44 safe-top">
      <header className="pt-16">
        <h2 className="font-serif text-3xl text-cream">our path</h2>
        <p className="mt-1 text-xs text-muted">small goals we fill together.</p>
      </header>

      <div className="mt-8 space-y-5">
        {goals.map((g) => {
          const pct = Math.min(100, (g.progress / g.target) * 100);
          const done = g.progress >= g.target;
          return (
            <motion.div key={g.id} layout className="glass rounded-3xl p-5">
              <div className="flex items-baseline justify-between">
                <p className={`font-serif text-[17px] ${done ? "text-amber-glow" : "text-cream"}`}>
                  {g.title}
                </p>
                <span className="text-xs tabular-nums text-muted">
                  {g.progress}/{g.target}
                </span>
              </div>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-void/60">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: done
                      ? "linear-gradient(90deg,#f2b263,#f4a6bd)"
                      : "linear-gradient(90deg,#7a2244,#cf93a6)",
                  }}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: "spring", damping: 22, stiffness: 160 }}
                />
              </div>
              <div className="mt-4 flex items-center justify-between">
                {done ? (
                  <p className="text-xs text-amber-glow">made it, together.</p>
                ) : (
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => increment(g)}
                    className="btn-warm rounded-full px-5 py-2 text-sm text-cream"
                  >
                    +1
                  </motion.button>
                )}
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => cheer(g)}
                  aria-label="cheer them on"
                  className="glass relative flex h-9 w-9 items-center justify-center rounded-full"
                >
                  <Heart
                    size={15}
                    className={cheeredId === g.id ? "fill-blush text-blush" : "text-blush-soft"}
                  />
                  <AnimatePresence>
                    {cheeredId === g.id && (
                      <motion.span
                        initial={{ opacity: 1, y: 0, scale: 0.7 }}
                        animate={{ opacity: 0, y: -26, scale: 1.15 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.1, ease: "easeOut" }}
                        className="pointer-events-none absolute"
                      >
                        <Heart size={14} className="fill-blush text-blush" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </div>
            </motion.div>
          );
        })}
        {goals.length === 0 && (
          <p className="mt-14 text-center text-sm text-muted">no shared goals yet.</p>
        )}
      </div>

      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="glass-strong fixed inset-x-0 bottom-0 z-40 rounded-t-[2rem] p-6 pb-10 safe-bottom"
          >
            <p className="font-serif text-xl text-cream">a new shared goal</p>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. drink 8 glasses of water today"
              className="field mt-4 w-full rounded-2xl px-5 py-4 text-cream placeholder-muted outline-none"
            />
            <div className="mt-3 flex items-center gap-3">
              <span className="text-sm text-muted">target</span>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className="field w-24 rounded-2xl px-4 py-3 text-center text-cream outline-none"
              />
            </div>
            <div className="mt-6 flex justify-between">
              <button className="text-sm text-muted" onClick={() => setAdding(false)}>
                not now
              </button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                disabled={!title.trim()}
                onClick={add}
                className="btn-warm rounded-full px-6 py-2.5 text-sm text-cream disabled:opacity-40"
              >
                set it
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!adding && (
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => {
            haptic("light");
            setAdding(true);
          }}
          className="glass-strong fixed bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full px-6 py-3 text-sm text-cream safe-bottom"
        >
          <Plus size={16} className="text-blush" /> new goal
        </motion.button>
      )}
    </div>
  );
}

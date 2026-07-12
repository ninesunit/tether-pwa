import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useTether } from "../context/TetherContext";
import { haptic } from "../lib/haptics";
import type { Goal } from "../lib/types";

/**
 * Tethered Path — cooperative micro-goals with one shared progress bar.
 * Either partner taps to advance it; increments are atomic via RPC.
 */
export default function PathScreen() {
  const { tether } = useTether();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("8");

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

  return (
    <div className="h-full overflow-y-auto px-6 pt-24 pb-36 safe-top">
      <h2 className="font-serif text-2xl text-cream">our path</h2>
      <p className="mt-1 text-xs text-muted">small goals we fill together.</p>

      <div className="mt-8 space-y-6">
        {goals.map((g) => {
          const pct = Math.min(100, (g.progress / g.target) * 100);
          const done = g.progress >= g.target;
          return (
            <motion.button
              key={g.id}
              layout
              whileTap={{ scale: done ? 1 : 0.98 }}
              onClick={() => increment(g)}
              className="block w-full rounded-3xl bg-ember-900/70 p-5 text-left"
            >
              <div className="flex items-baseline justify-between">
                <p className={`text-[15px] ${done ? "text-amber-glow" : "text-cream"}`}>{g.title}</p>
                <span className="text-xs tabular-nums text-muted">
                  {g.progress}/{g.target}
                </span>
              </div>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-void/60">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: done
                      ? "linear-gradient(90deg,#f0b46a,#e8a4b8)"
                      : "linear-gradient(90deg,#6e1e3c,#c98da0)",
                  }}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: "spring", damping: 22, stiffness: 160 }}
                />
              </div>
              {done && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-3 text-xs text-amber-glow"
                >
                  made it, together.
                </motion.p>
              )}
              {!done && <p className="mt-3 text-[11px] text-muted">tap anywhere to add one</p>}
            </motion.button>
          );
        })}
        {goals.length === 0 && (
          <p className="mt-12 text-center text-sm text-muted">no shared goals yet.</p>
        )}
      </div>

      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-10 rounded-t-[2rem] bg-ember-950/95 p-6 pb-10 backdrop-blur-xl safe-bottom"
          >
            <p className="font-serif text-lg text-cream">a new shared goal</p>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. drink 8 glasses of water today"
              className="mt-4 w-full rounded-2xl bg-ember-900/70 px-5 py-4 text-cream placeholder-muted outline-none"
            />
            <div className="mt-3 flex items-center gap-3">
              <span className="text-sm text-muted">target</span>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className="w-24 rounded-2xl bg-ember-900/70 px-4 py-3 text-center text-cream outline-none"
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
                className="rounded-full bg-burgundy px-6 py-2.5 text-sm text-cream disabled:opacity-40"
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
          className="fixed bottom-28 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ember-800/90 px-6 py-3 text-sm text-cream backdrop-blur safe-bottom"
        >
          <Plus size={16} /> new goal
        </motion.button>
      )}
    </div>
  );
}

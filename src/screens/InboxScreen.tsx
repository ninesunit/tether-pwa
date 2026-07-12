import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Feather } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useTether } from "../context/TetherContext";
import { haptic } from "../lib/haptics";
import type { Letter } from "../lib/types";

const LOCK_MINUTES = 30;

function Countdown({ unlockAt }: { unlockAt: string }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(unlockAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return (
    <span className="tabular-nums">
      {m}:{s.toString().padStart(2, "0")}
    </span>
  );
}

/**
 * The Slow Inbox. Letters arrive sealed and open 30 minutes later.
 * No read receipts, no typing indicators — just letters.
 */
export default function InboxScreen() {
  const { tether, session } = useTether();
  const [letters, setLetters] = useState<Letter[]>([]);
  const [draft, setDraft] = useState("");
  const [writing, setWriting] = useState(false);
  const [, forceTick] = useState(0);
  const me = session?.user.id;

  const load = useCallback(async () => {
    if (!tether) return;
    const { data } = await supabase
      .from("letters")
      .select("*")
      .eq("tether_id", tether.id)
      .order("created_at", { ascending: false })
      .limit(40);
    setLetters((data as Letter[]) ?? []);
  }, [tether]);

  useEffect(() => {
    load();
    if (!tether) return;
    const ch = supabase
      .channel(`letters:${tether.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "letters", filter: `tether_id=eq.${tether.id}` },
        (payload) => {
          setLetters((l) => [payload.new as Letter, ...l]);
          haptic("light");
        },
      )
      .subscribe();
    // Re-render every 30s so sealed letters unlock without a refresh.
    const t = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(t);
    };
  }, [tether, load]);

  const send = async () => {
    if (!tether || !me || !draft.trim()) return;
    haptic("medium");
    const unlock = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
    const body = draft.trim();
    setDraft("");
    setWriting(false);
    await supabase.from("letters").insert({
      tether_id: tether.id,
      sender_id: me,
      body,
      unlock_at: unlock,
    });
  };

  return (
    <div className="flex h-full flex-col px-6 pt-24 safe-top">
      <h2 className="font-serif text-2xl text-cream">letters</h2>
      <p className="mt-1 text-xs text-muted">they open thirty minutes after they're sent.</p>

      <div className="mt-6 flex-1 space-y-4 overflow-y-auto pb-40">
        <AnimatePresence initial={false}>
          {letters.map((l) => {
            const mine = l.sender_id === me;
            const locked = !mine && new Date(l.unlock_at).getTime() > Date.now();
            return (
              <motion.div
                key={l.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className={`max-w-[85%] rounded-3xl px-5 py-4 ${
                  mine ? "ml-auto bg-burgundy/60" : "bg-ember-900/80"
                }`}
              >
                {locked ? (
                  <div className="flex items-center gap-3 text-muted">
                    <Feather size={16} className="text-blush-soft" />
                    <span className="text-sm">
                      a letter is waiting · <Countdown unlockAt={l.unlock_at} />
                    </span>
                  </div>
                ) : (
                  <p className="text-[15px] leading-relaxed text-cream/95">{l.body}</p>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {letters.length === 0 && (
          <p className="mt-16 text-center text-sm text-muted">no letters yet. write the first.</p>
        )}
      </div>

      {/* compose — a bottom sheet, not a chat bar */}
      <AnimatePresence>
        {writing ? (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 rounded-t-[2rem] bg-ember-950/95 p-6 pb-10 backdrop-blur-xl safe-bottom"
          >
            <textarea
              autoFocus
              rows={4}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="write slowly…"
              className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-cream placeholder-muted outline-none"
            />
            <div className="mt-4 flex justify-between">
              <button className="text-sm text-muted" onClick={() => setWriting(false)}>
                keep it
              </button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                disabled={!draft.trim()}
                onClick={send}
                className="rounded-full bg-burgundy px-6 py-2.5 text-sm text-cream disabled:opacity-40"
              >
                seal &amp; send
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              haptic("light");
              setWriting(true);
            }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 rounded-full bg-ember-800/90 px-6 py-3 text-sm text-cream backdrop-blur safe-bottom"
          >
            write a letter
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

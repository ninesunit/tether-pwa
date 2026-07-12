import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useTether } from "../context/TetherContext";
import { haptic } from "../lib/haptics";
import type { Token } from "../lib/types";

const SUGGESTIONS = [
  "One free coffee",
  "A 10-minute massage",
  "Win one argument",
  "Breakfast in bed",
  "Movie night, your pick",
  "One chore, done by me",
];

/**
 * Digital Tokens — playful redeemable gestures rendered as physical cards.
 * Redeeming fires a pulse back to the sender.
 */
export default function TokensScreen() {
  const { tether, session, sendPulse } = useTether();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [minting, setMinting] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const me = session?.user.id;

  const load = useCallback(async () => {
    if (!tether) return;
    const { data } = await supabase
      .from("tokens")
      .select("*")
      .eq("tether_id", tether.id)
      .order("created_at", { ascending: false });
    setTokens((data as Token[]) ?? []);
  }, [tether]);

  useEffect(() => {
    load();
    if (!tether) return;
    const ch = supabase
      .channel(`tokens:${tether.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tokens", filter: `tether_id=eq.${tether.id}` },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tether, load]);

  const mint = async () => {
    if (!tether || !me || !title.trim()) return;
    haptic("success");
    await supabase.from("tokens").insert({
      tether_id: tether.id,
      sender_id: me,
      title: title.trim(),
      note: note.trim() || null,
    });
    setTitle("");
    setNote("");
    setMinting(false);
  };

  const redeem = async (t: Token) => {
    haptic("heavy");
    await supabase.from("tokens").update({ redeemed_at: new Date().toISOString() }).eq("id", t.id);
    sendPulse(); // let the sender feel it being cashed in
  };

  const wallet = tokens.filter((t) => t.sender_id !== me); // received
  const given = tokens.filter((t) => t.sender_id === me);

  const Card = ({ t, mine }: { t: Token; mine: boolean }) => (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl p-5 ${
        t.redeemed_at ? "bg-ember-900/50 opacity-60" : "bg-gradient-to-br from-burgundy to-ember-800"
      }`}
      style={{ boxShadow: t.redeemed_at ? "none" : "0 12px 30px -12px rgba(110,30,60,0.6)" }}
    >
      <Sparkles size={14} className="text-amber-glow/70" />
      <p className="mt-3 font-serif text-lg text-cream">{t.title}</p>
      {t.note && <p className="mt-1 text-xs text-blush-soft">{t.note}</p>}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted">
          {t.redeemed_at ? "redeemed" : mine ? "given" : "yours to spend"}
        </span>
        {!t.redeemed_at && !mine && (
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={() => redeem(t)}
            className="rounded-full bg-void/40 px-4 py-1.5 text-xs text-cream"
          >
            redeem
          </motion.button>
        )}
      </div>
    </motion.div>
  );

  return (
    <div className="h-full overflow-y-auto px-6 pt-24 pb-36 safe-top">
      <h2 className="font-serif text-2xl text-cream">tokens</h2>
      <p className="mt-1 text-xs text-muted">small promises, redeemable anytime.</p>

      <p className="mt-8 text-[11px] uppercase tracking-widest text-muted">your wallet</p>
      <div className="mt-3 space-y-4">
        {wallet.length === 0 && <p className="text-sm text-muted">nothing to spend — yet.</p>}
        {wallet.map((t) => (
          <Card key={t.id} t={t} mine={false} />
        ))}
      </div>

      <p className="mt-10 text-[11px] uppercase tracking-widest text-muted">given by you</p>
      <div className="mt-3 space-y-4">
        {given.length === 0 && <p className="text-sm text-muted">mint one below.</p>}
        {given.map((t) => (
          <Card key={t.id} t={t} mine />
        ))}
      </div>

      <AnimatePresence>
        {minting && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-10 rounded-t-[2rem] bg-ember-950/95 p-6 pb-10 backdrop-blur-xl safe-bottom"
          >
            <p className="font-serif text-lg text-cream">mint a token</p>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="what are you promising?"
              className="mt-4 w-full rounded-2xl bg-ember-900/70 px-5 py-4 text-cream placeholder-muted outline-none"
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="a note (optional)"
              className="mt-3 w-full rounded-2xl bg-ember-900/70 px-5 py-4 text-cream placeholder-muted outline-none"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setTitle(s)}
                  className="rounded-full bg-ember-800/80 px-3 py-1.5 text-xs text-blush-soft"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="mt-6 flex justify-between">
              <button className="text-sm text-muted" onClick={() => setMinting(false)}>
                not now
              </button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                disabled={!title.trim()}
                onClick={mint}
                className="rounded-full bg-burgundy px-6 py-2.5 text-sm text-cream disabled:opacity-40"
              >
                mint &amp; give
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!minting && (
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => {
            haptic("light");
            setMinting(true);
          }}
          className="fixed bottom-28 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ember-800/90 px-6 py-3 text-sm text-cream backdrop-blur safe-bottom"
        >
          <Plus size={16} /> mint a token
        </motion.button>
      )}
    </div>
  );
}

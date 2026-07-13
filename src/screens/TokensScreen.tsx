import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useTether } from "../context/TetherContext";
import { haptic } from "../lib/haptics";
import { sfx } from "../lib/sfx";
import Fab from "../components/Fab";
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
 * Digital Tokens — playful redeemable gestures rendered as ticket-like
 * cards. Redeeming fires a pulse back to the sender.
 */
export default function TokensScreen() {
  const { tether, session, partnerProfile, sendPulse } = useTether();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [tab, setTab] = useState<"wallet" | "given">("wallet");
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
    sfx.chime();
    await supabase.from("tokens").update({ redeemed_at: new Date().toISOString() }).eq("id", t.id);
    sendPulse(); // let the sender feel it being cashed in
  };

  const shown = tokens.filter((t) => (tab === "wallet" ? t.sender_id !== me : t.sender_id === me));

  return (
    <div className="h-full overflow-y-auto px-6 pb-44 safe-top">
      <header className="pt-16">
        <h2 className="font-serif text-3xl text-cream">tokens</h2>
        <p className="mt-1 text-xs text-muted">small promises, redeemable anytime.</p>
      </header>

      {/* tabs */}
      <div className="glass mt-6 flex rounded-full p-1">
        {(["wallet", "given"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              haptic("light");
            }}
            className="relative flex-1 rounded-full py-2 text-sm"
          >
            {tab === t && (
              <motion.span
                layoutId="token-tab"
                className="absolute inset-0 rounded-full bg-burgundy/70"
                transition={{ type: "spring", damping: 26, stiffness: 300 }}
              />
            )}
            <span className={`relative ${tab === t ? "text-cream" : "text-muted"}`}>
              {t === "wallet" ? "your wallet" : "given by you"}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((t) => {
            const mine = t.sender_id === me;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`relative overflow-hidden rounded-2xl ${
                  t.redeemed_at ? "glass opacity-55" : "card-gradient"
                }`}
                style={
                  t.redeemed_at
                    ? undefined
                    : { boxShadow: "0 16px 36px -14px rgba(122,34,68,0.65)" }
                }
              >
                {/* ticket notches */}
                <span className="absolute -left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-void" />
                <span className="absolute -right-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-void" />
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <Sparkles size={14} className="text-amber-glow/80" />
                    <span className="text-[10px] uppercase tracking-widest text-muted">
                      {t.redeemed_at
                        ? "redeemed"
                        : mine
                          ? `for ${partnerProfile?.display_name ?? "them"}`
                          : "yours to spend"}
                    </span>
                  </div>
                  <p className="mt-3 font-serif text-xl text-cream">{t.title}</p>
                  {t.note && <p className="mt-1 text-xs text-blush-soft">{t.note}</p>}
                  <div className="mt-4 flex items-center justify-between border-t border-dashed border-blush/20 pt-3.5">
                    <span className="text-[10px] text-muted">
                      {new Date(t.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {!t.redeemed_at && !mine && (
                      <motion.button
                        whileTap={{ scale: 0.93 }}
                        onClick={() => redeem(t)}
                        className="rounded-full bg-void/45 px-4 py-1.5 text-xs text-cream"
                      >
                        redeem
                      </motion.button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {shown.length === 0 && (
          <p className="mt-14 text-center text-sm text-muted">
            {tab === "wallet" ? "nothing to spend — yet." : "mint one below."}
          </p>
        )}
      </div>

      <AnimatePresence>
        {minting && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="glass-strong fixed inset-x-0 bottom-0 z-40 rounded-t-[2rem] p-6 pb-10 safe-bottom"
          >
            <p className="font-serif text-xl text-cream">mint a token</p>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="what are you promising?"
              className="field mt-4 w-full rounded-2xl px-5 py-4 text-cream placeholder-muted outline-none"
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="a note (optional)"
              className="field mt-3 w-full rounded-2xl px-5 py-4 text-cream placeholder-muted outline-none"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setTitle(s)}
                  className="glass rounded-full px-3 py-1.5 text-xs text-blush-soft"
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
                className="btn-warm rounded-full px-6 py-2.5 text-sm text-cream disabled:opacity-40"
              >
                mint &amp; give
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!minting && <Fab icon={Plus} label="mint a token" onClick={() => setMinting(true)} />}
    </div>
  );
}

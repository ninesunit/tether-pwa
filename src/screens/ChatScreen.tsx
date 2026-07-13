import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useTether } from "../context/TetherContext";
import { haptic } from "../lib/haptics";
import { sfx } from "../lib/sfx";
import { useKeyboardInset } from "../lib/useKeyboardInset";
import type { Message } from "../lib/types";

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "today";
  if (d.toDateString() === yesterday.toDateString()) return "yesterday";
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Instant chat — still calm: no read receipts, no typing indicators.
 * (Table name stays `letters` from the earlier slow-inbox design.)
 */
export default function ChatScreen() {
  const { tether, session, partnerProfile, addHeat } = useTether();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const keyboardInset = useKeyboardInset();
  const me = session?.user.id;

  const load = useCallback(async () => {
    if (!tether) return;
    const { data } = await supabase
      .from("letters")
      .select("*")
      .eq("tether_id", tether.id)
      .order("created_at", { ascending: false })
      .limit(120);
    setMessages(((data as Message[]) ?? []).reverse());
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
          const msg = payload.new as Message;
          setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]));
          if (msg.sender_id !== me) {
            haptic("medium");
            sfx.pop();
          }
        },
      )
      .subscribe();
    // refetch when the PWA returns to the foreground (iOS drops sockets)
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      supabase.removeChannel(ch);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tether, load, me]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const send = async () => {
    if (!tether || !me || !draft.trim()) return;
    const body = draft.trim();
    setDraft("");
    haptic("light");
    sfx.pop();
    addHeat(2);
    // optimistic bubble; realtime insert replaces it by id de-dupe
    const temp: Message = {
      id: `temp-${Date.now()}`,
      tether_id: tether.id,
      sender_id: me,
      body,
      unlock_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, temp]);
    const { data } = await supabase
      .from("letters")
      .insert({ tether_id: tether.id, sender_id: me, body, unlock_at: new Date().toISOString() })
      .select()
      .single();
    if (data) {
      setMessages((m) =>
        m.some((x) => x.id === (data as Message).id)
          ? m.filter((x) => x.id !== temp.id)
          : m.map((x) => (x.id === temp.id ? (data as Message) : x)),
      );
    }
  };

  let lastDay = "";

  return (
    <div className="flex h-full flex-col safe-top">
      <header className="px-6 pt-16">
        <h2 className="font-serif text-3xl text-cream">
          {partnerProfile ? `you & ${partnerProfile.display_name.toLowerCase()}` : "chat"}
        </h2>
        <p className="mt-1 text-xs text-muted">no read receipts. no pressure. just you two.</p>
      </header>

      <div className="mt-4 flex-1 space-y-2 overflow-y-auto px-5 pb-56">
        {messages.map((m) => {
          const mine = m.sender_id === me;
          const label = dayLabel(m.created_at);
          const showDay = label !== lastDay;
          lastDay = label;
          return (
            <div key={m.id}>
              {showDay && (
                <p className="eyebrow py-4 text-center">{label}</p>
              )}
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", damping: 24, stiffness: 300 }}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-3xl px-4.5 py-3 ${
                    mine ? "card-gradient rounded-br-lg" : "glass rounded-bl-lg"
                  }`}
                >
                  <p className="text-[15px] leading-relaxed text-cream/95">{m.body}</p>
                  <p className={`mt-1 text-[10px] ${mine ? "text-blush-soft/70" : "text-muted/70"}`}>
                    {timeLabel(m.created_at)}
                  </p>
                </div>
              </motion.div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="mt-20 text-center text-sm text-muted">say something soft.</p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* composer — floats above the nav; lifts above the iOS keyboard */}
      <div
        className="above-nav fixed inset-x-0 z-30 px-5"
        style={keyboardInset > 0 ? { bottom: keyboardInset + 8 } : undefined}
      >
        <div className="glass-strong flex items-end gap-2 rounded-[1.75rem] p-2 pl-5">
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`message ${partnerProfile?.display_name ?? "them"}…`}
            className="max-h-28 flex-1 resize-none bg-transparent py-2.5 text-[15px] text-cream placeholder-muted outline-none"
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            disabled={!draft.trim()}
            onClick={send}
            aria-label="send"
            className="btn-warm flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
          >
            <ArrowUp size={17} className="text-cream" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}

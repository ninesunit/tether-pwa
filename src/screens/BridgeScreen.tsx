import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabaseClient";
import { useTether } from "../context/TetherContext";
import { haptic } from "../lib/haptics";
import type { DailyQuestion, QuestionAnswer } from "../lib/types";

const PROMPTS = [
  "What is a small thing I did recently that made you smile?",
  "What's a memory of us you replay when you miss me?",
  "What did you need today that you didn't ask for?",
  "If tonight were completely ours, what would we do?",
  "What's something about me you hope never changes?",
  "When did you last feel proudest of us?",
  "What's a tiny ritual you'd love us to start?",
  "What song has felt like us lately?",
  "What worry could I carry for you this week?",
  "What did you almost tell me but didn't?",
  "Where should we wake up together someday?",
  "What's the gentlest thing I've ever said to you?",
  "What made you laugh recently that I missed?",
  "What do you want more of from me — time, words, or touch?",
];

function promptForToday(tetherId: string): string {
  // Deterministic per couple per day, so both clients pick the same prompt.
  const day = Math.floor(Date.now() / 86_400_000);
  let hash = 0;
  for (const c of tetherId) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return PROMPTS[Math.abs(hash + day) % PROMPTS.length];
}

/**
 * The Question Bridge — one prompt a day; answers stay sealed until both
 * partners have written theirs (enforced by RLS, mirrored in the UI).
 */
export default function BridgeScreen() {
  const { tether, session, profile } = useTether();
  const [question, setQuestion] = useState<DailyQuestion | null>(null);
  const [answers, setAnswers] = useState<QuestionAnswer[]>([]);
  const [draft, setDraft] = useState("");
  const me = session?.user.id;

  const load = useCallback(async () => {
    if (!tether) return;
    const today = new Date().toISOString().slice(0, 10);
    let { data: q } = await supabase
      .from("daily_questions")
      .select("*")
      .eq("tether_id", tether.id)
      .eq("for_date", today)
      .maybeSingle();
    if (!q) {
      const { data: created } = await supabase
        .from("daily_questions")
        .upsert(
          { tether_id: tether.id, prompt: promptForToday(tether.id), for_date: today },
          { onConflict: "tether_id,for_date", ignoreDuplicates: false },
        )
        .select()
        .single();
      q = created;
    }
    if (!q) return;
    setQuestion(q as DailyQuestion);
    const { data: ans } = await supabase
      .from("question_answers")
      .select("*")
      .eq("question_id", (q as DailyQuestion).id);
    setAnswers((ans as QuestionAnswer[]) ?? []);
  }, [tether]);

  useEffect(() => {
    load();
    if (!tether) return;
    const ch = supabase
      .channel(`answers:${tether.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "question_answers" },
        () => {
          load();
          haptic("light");
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tether, load]);

  const myAnswer = answers.find((a) => a.author_id === me);
  const partnerAnswer = answers.find((a) => a.author_id !== me);
  const unlocked = !!myAnswer && !!partnerAnswer;

  const submit = async () => {
    if (!question || !me || !draft.trim()) return;
    haptic("medium");
    await supabase.from("question_answers").insert({
      question_id: question.id,
      author_id: me,
      body: draft.trim(),
    });
    setDraft("");
    load();
  };

  return (
    <div className="flex h-full flex-col px-6 pt-24 safe-top">
      <h2 className="font-serif text-2xl text-cream">the bridge</h2>
      <p className="mt-1 text-xs text-muted">one question a day. blind until you both answer.</p>

      {question && (
        <motion.p
          key={question.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-10 font-serif text-[22px] leading-snug text-cream"
        >
          “{question.prompt}”
        </motion.p>
      )}

      <div className="mt-10 flex-1 space-y-5 overflow-y-auto pb-32">
        <AnimatePresence mode="wait">
          {!myAnswer ? (
            <motion.div key="compose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <textarea
                rows={4}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="your answer, just for them…"
                className="w-full resize-none rounded-3xl bg-ember-900/70 px-5 py-4 text-[15px] leading-relaxed text-cream placeholder-muted outline-none"
              />
              <motion.button
                whileTap={{ scale: 0.96 }}
                disabled={!draft.trim()}
                onClick={submit}
                className="mt-4 w-full rounded-2xl bg-burgundy py-4 text-cream disabled:opacity-40"
              >
                seal my answer
              </motion.button>
            </motion.div>
          ) : (
            <motion.div key="answers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
              <div className="rounded-3xl bg-burgundy/40 px-5 py-4">
                <p className="text-[11px] uppercase tracking-widest text-blush-soft">
                  {profile?.display_name ?? "you"}
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-cream/95">{myAnswer.body}</p>
              </div>
              <div className="rounded-3xl bg-ember-900/80 px-5 py-4">
                <p className="text-[11px] uppercase tracking-widest text-muted">them</p>
                {unlocked ? (
                  <motion.p
                    initial={{ filter: "blur(8px)", opacity: 0.4 }}
                    animate={{ filter: "blur(0px)", opacity: 1 }}
                    transition={{ duration: 1.4 }}
                    className="mt-2 text-[15px] leading-relaxed text-cream/95"
                  >
                    {partnerAnswer!.body}
                  </motion.p>
                ) : (
                  <p className="mt-2 text-sm italic text-muted">
                    sealed — it will appear when they answer.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

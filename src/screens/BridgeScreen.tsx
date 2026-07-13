import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock } from "lucide-react";
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

interface PastBridge {
  question: DailyQuestion;
  mine?: QuestionAnswer;
  theirs?: QuestionAnswer;
}

/**
 * The Question Bridge — one prompt a day; answers stay sealed until both
 * partners have written theirs (enforced by RLS, mirrored in the UI).
 */
export default function BridgeScreen() {
  const { tether, session, profile, partnerProfile, sendPulse } = useTether();
  const [question, setQuestion] = useState<DailyQuestion | null>(null);
  const [answers, setAnswers] = useState<QuestionAnswer[]>([]);
  const [past, setPast] = useState<PastBridge[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const me = session?.user.id;
  const partnerName = partnerProfile?.display_name ?? "them";

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

    // today's answers + the last week of unlocked bridges
    const { data: recent } = await supabase
      .from("daily_questions")
      .select("*")
      .eq("tether_id", tether.id)
      .order("for_date", { ascending: false })
      .limit(8);
    const qs = (recent as DailyQuestion[]) ?? [];
    const ids = qs.map((x) => x.id);
    const { data: ans } = await supabase
      .from("question_answers")
      .select("*")
      .in("question_id", ids);
    const allAnswers = (ans as QuestionAnswer[]) ?? [];
    setAnswers(allAnswers.filter((a) => a.question_id === (q as DailyQuestion).id));
    setPast(
      qs
        .filter((x) => x.id !== (q as DailyQuestion).id)
        .map((x) => ({
          question: x,
          mine: allAnswers.find((a) => a.question_id === x.id && a.author_id === me),
          theirs: allAnswers.find((a) => a.question_id === x.id && a.author_id !== me),
        }))
        .filter((p) => p.mine || p.theirs),
    );
  }, [tether, me]);

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
    if (!question || !me || !draft.trim() || saving) return;
    setSaving(true);
    haptic("medium");
    const { error } = await supabase.from("question_answers").insert({
      question_id: question.id,
      author_id: me,
      body: draft.trim(),
    });
    if (!error) {
      setDraft("");
      sendPulse(); // a soft nudge: "I answered"
      await load();
    }
    setSaving(false);
  };

  return (
    <div className="h-full overflow-y-auto px-6 pb-40 safe-top">
      <header className="pt-16">
        <h2 className="font-serif text-3xl text-cream">the bridge</h2>
        <p className="mt-1 text-xs text-muted">one question a day. blind until you both answer.</p>
      </header>

      {question && (
        <motion.div
          key={question.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-gradient mt-8 rounded-[1.75rem] p-6"
        >
          <p className="eyebrow">today</p>
          <p className="mt-3 font-serif text-[22px] leading-snug text-cream">
            “{question.prompt}”
          </p>
        </motion.div>
      )}

      <div className="mt-6 space-y-5">
        <AnimatePresence mode="wait">
          {!myAnswer ? (
            <motion.div key="compose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <textarea
                rows={4}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="your answer, just for them…"
                className="field w-full resize-none rounded-3xl px-5 py-4 text-[15px] leading-relaxed text-cream placeholder-muted outline-none"
              />
              <motion.button
                whileTap={{ scale: 0.96 }}
                disabled={!draft.trim() || saving}
                onClick={submit}
                className="btn-warm mt-4 w-full rounded-2xl py-4 text-cream disabled:opacity-40"
              >
                {saving ? "sealing…" : "seal my answer"}
              </motion.button>
            </motion.div>
          ) : (
            <motion.div key="answers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="glass rounded-3xl px-5 py-4">
                <p className="eyebrow text-blush-soft">{profile?.display_name ?? "you"}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-cream/95">{myAnswer.body}</p>
              </div>
              <div className="glass rounded-3xl px-5 py-4">
                <p className="eyebrow">{partnerName}</p>
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
                  <p className="mt-2 flex items-center gap-2 text-sm italic text-muted">
                    <Lock size={13} /> sealed — it appears when {partnerName} answers.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {past.length > 0 && (
        <div className="mt-12">
          <p className="eyebrow">past bridges</p>
          <div className="mt-4 space-y-4">
            {past.map((p) => (
              <details key={p.question.id} className="glass rounded-3xl px-5 py-4">
                <summary className="cursor-pointer list-none">
                  <p className="text-[10px] uppercase tracking-widest text-muted">
                    {new Date(p.question.for_date).toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                  <p className="mt-1.5 font-serif text-[16px] leading-snug text-cream/90">
                    “{p.question.prompt}”
                  </p>
                </summary>
                <div className="mt-4 space-y-3 border-t border-blush/10 pt-4">
                  {p.mine && (
                    <div>
                      <p className="eyebrow text-blush-soft">{profile?.display_name ?? "you"}</p>
                      <p className="mt-1 text-sm leading-relaxed text-cream/90">{p.mine.body}</p>
                    </div>
                  )}
                  <div>
                    <p className="eyebrow">{partnerName}</p>
                    {p.theirs ? (
                      <p className="mt-1 text-sm leading-relaxed text-cream/90">{p.theirs.body}</p>
                    ) : (
                      <p className="mt-1 text-sm italic text-muted">never answered.</p>
                    )}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

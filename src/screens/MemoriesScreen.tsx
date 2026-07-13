import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, ImagePlus } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useTether } from "../context/TetherContext";
import { haptic } from "../lib/haptics";
import type { Memory } from "../lib/types";

function publicUrl(path: string) {
  return supabase.storage.from("memories").getPublicUrl(path).data.publicUrl;
}

/**
 * The Polaroid Wall — every photo becomes a physical print, slightly
 * off-axis with a piece of tape, pinned to a shared corkboard.
 */
export default function MemoriesScreen() {
  const { tether, session } = useTether();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [uploading, setUploading] = useState(false);
  const [burstId, setBurstId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ file: File; preview: string } | null>(null);
  const [caption, setCaption] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!tether) return;
    const { data } = await supabase
      .from("memories")
      .select("*")
      .eq("tether_id", tether.id)
      .order("created_at", { ascending: false })
      .limit(60);
    setMemories((data as Memory[]) ?? []);
  }, [tether]);

  useEffect(() => {
    load();
    if (!tether) return;
    const ch = supabase
      .channel(`memories:${tether.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "memories", filter: `tether_id=eq.${tether.id}` },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tether, load]);

  const confirmUpload = async () => {
    if (!tether || !session || !pending) return;
    setUploading(true);
    haptic("light");
    const file = pending.file;
    const path = `${tether.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("memories").upload(path, file, {
      cacheControl: "31536000",
    });
    if (!error) {
      await supabase.from("memories").insert({
        tether_id: tether.id,
        uploader_id: session.user.id,
        storage_path: path,
        caption: caption.trim() || null,
        rotation: (Math.random() - 0.5) * 8, // stored so both partners see the same tilt
      });
      haptic("success");
    }
    URL.revokeObjectURL(pending.preview);
    setPending(null);
    setCaption("");
    setUploading(false);
  };

  const toggleHeart = async (m: Memory) => {
    haptic(m.hearted ? "light" : "medium");
    if (!m.hearted) setBurstId(m.id);
    setMemories((ms) => ms.map((x) => (x.id === m.id ? { ...x, hearted: !x.hearted } : x)));
    await supabase.from("memories").update({ hearted: !m.hearted }).eq("id", m.id);
  };

  return (
    <div className="h-full overflow-y-auto px-5 pb-44 safe-top">
      <header className="px-1 pt-16">
        <h2 className="font-serif text-3xl text-cream">the wall</h2>
        <p className="mt-1 text-xs text-muted">photos tossed on the table, kept forever.</p>
      </header>

      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-9">
        {memories.map((m, i) => (
          <motion.figure
            key={m.id}
            initial={{ opacity: 0, scale: 0.9, rotate: 0 }}
            animate={{ opacity: 1, scale: 1, rotate: m.rotation }}
            transition={{ delay: Math.min(i * 0.05, 0.4), type: "spring", damping: 18 }}
            className="relative bg-[#faf6f0] p-2 pb-9 shadow-2xl shadow-black/70"
            onDoubleClick={() => toggleHeart(m)}
          >
            {/* tape */}
            <span
              className="absolute -top-2.5 left-1/2 h-5 w-14 -translate-x-1/2 rotate-2 bg-cream/25"
              style={{ backdropFilter: "blur(1px)" }}
            />
            <img
              src={publicUrl(m.storage_path)}
              alt={m.caption ?? "a shared memory"}
              loading="lazy"
              className="polaroid-photo aspect-square w-full object-cover"
            />
            {m.caption && (
              <figcaption className="absolute bottom-2 left-0 right-0 truncate px-2 text-center font-serif text-[11px] italic text-neutral-600">
                {m.caption}
              </figcaption>
            )}
            <button
              onClick={() => toggleHeart(m)}
              className="absolute -right-2 -top-2 rounded-full bg-ember-950/90 p-2"
              aria-label="Heart this memory"
            >
              <Heart size={15} className={m.hearted ? "fill-blush text-blush" : "text-muted"} />
            </button>
            <AnimatePresence>
              {burstId === m.id && (
                <motion.div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.9 }}
                  onAnimationComplete={() => setBurstId(null)}
                >
                  {[...Array(6)].map((_, k) => (
                    <motion.span
                      key={k}
                      className="absolute"
                      initial={{ scale: 0.4, x: 0, y: 0, opacity: 1 }}
                      animate={{
                        scale: 1,
                        x: Math.cos((k / 6) * Math.PI * 2) * 46,
                        y: Math.sin((k / 6) * Math.PI * 2) * 46,
                        opacity: 0,
                      }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    >
                      <Heart size={13} className="fill-blush text-blush" />
                    </motion.span>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.figure>
        ))}
      </div>

      {memories.length === 0 && (
        <p className="mt-20 text-center text-sm text-muted">the table is empty. pin something.</p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setPending({ file: f, preview: URL.createObjectURL(f) });
          e.target.value = "";
        }}
      />

      {/* caption sheet before pinning */}
      <AnimatePresence>
        {pending && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="glass-strong fixed inset-x-0 bottom-0 z-40 rounded-t-[2rem] p-6 pb-10 safe-bottom"
          >
            <div className="mx-auto w-40 rotate-2 bg-[#faf6f0] p-1.5 pb-6 shadow-xl">
              <img src={pending.preview} alt="" className="polaroid-photo aspect-square w-full object-cover" />
            </div>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="a few words for the back… (optional)"
              className="field mt-5 w-full rounded-2xl px-5 py-4 text-cream placeholder-muted outline-none"
            />
            <div className="mt-4 flex justify-between">
              <button
                className="text-sm text-muted"
                onClick={() => {
                  URL.revokeObjectURL(pending.preview);
                  setPending(null);
                  setCaption("");
                }}
              >
                never mind
              </button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                disabled={uploading}
                onClick={confirmUpload}
                className="btn-warm rounded-full px-6 py-2.5 text-sm text-cream disabled:opacity-50"
              >
                {uploading ? "pinning…" : "pin it"}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!pending && (
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => fileRef.current?.click()}
          className="glass-strong fixed bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full px-6 py-3 text-sm text-cream safe-bottom"
        >
          <ImagePlus size={16} className="text-blush" /> pin a memory
        </motion.button>
      )}
    </div>
  );
}

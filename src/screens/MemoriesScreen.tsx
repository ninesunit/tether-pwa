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
 * Analog Memories — a corkboard of Polaroids scattered slightly off-axis.
 * Heart a photo for a small burst; no comments, no counts, no feed.
 */
export default function MemoriesScreen() {
  const { tether, session } = useTether();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [uploading, setUploading] = useState(false);
  const [burstId, setBurstId] = useState<string | null>(null);
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

  const upload = async (file: File) => {
    if (!tether || !session) return;
    setUploading(true);
    haptic("light");
    const path = `${tether.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error } = await supabase.storage.from("memories").upload(path, file, {
      cacheControl: "31536000",
    });
    if (!error) {
      await supabase.from("memories").insert({
        tether_id: tether.id,
        uploader_id: session.user.id,
        storage_path: path,
        rotation: (Math.random() - 0.5) * 8, // stored so both partners see the same tilt
      });
      haptic("success");
    }
    setUploading(false);
  };

  const toggleHeart = async (m: Memory) => {
    haptic(m.hearted ? "light" : "medium");
    if (!m.hearted) setBurstId(m.id);
    setMemories((ms) => ms.map((x) => (x.id === m.id ? { ...x, hearted: !x.hearted } : x)));
    await supabase.from("memories").update({ hearted: !m.hearted }).eq("id", m.id);
  };

  return (
    <div className="h-full overflow-y-auto px-5 pt-24 pb-36 safe-top">
      <h2 className="font-serif text-2xl text-cream">memories</h2>
      <p className="mt-1 text-xs text-muted">photos tossed on the table, kept forever.</p>

      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8">
        {memories.map((m, i) => (
          <motion.figure
            key={m.id}
            initial={{ opacity: 0, scale: 0.9, rotate: 0 }}
            animate={{ opacity: 1, scale: 1, rotate: m.rotation }}
            transition={{ delay: Math.min(i * 0.05, 0.4), type: "spring", damping: 18 }}
            className="relative bg-white p-2 pb-8 shadow-2xl shadow-black/60"
            onDoubleClick={() => toggleHeart(m)}
          >
            <img
              src={publicUrl(m.storage_path)}
              alt={m.caption ?? "a shared memory"}
              loading="lazy"
              className="aspect-square w-full object-cover"
            />
            {m.caption && (
              <figcaption className="absolute bottom-1.5 left-0 right-0 text-center font-serif text-[11px] italic text-neutral-600">
                {m.caption}
              </figcaption>
            )}
            <button
              onClick={() => toggleHeart(m)}
              className="absolute -right-2 -top-2 rounded-full bg-ember-950/90 p-2"
              aria-label="Heart this memory"
            >
              <Heart
                size={15}
                className={m.hearted ? "fill-blush text-blush" : "text-muted"}
              />
            </button>
            {/* heart burst */}
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
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      <motion.button
        whileTap={{ scale: 0.94 }}
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        className="fixed bottom-28 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ember-800/90 px-6 py-3 text-sm text-cream backdrop-blur disabled:opacity-50 safe-bottom"
      >
        <ImagePlus size={16} />
        {uploading ? "pinning…" : "pin a memory"}
      </motion.button>
    </div>
  );
}

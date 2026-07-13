import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { Search, Disc3 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useTether } from "../context/TetherContext";
import { haptic } from "../lib/haptics";
import type { NeedleDrop } from "../lib/types";

/**
 * The Needle Drop — one song at a time, sent like a physical record.
 * Search slides in like crate-digging; sending demands a 3-second hold
 * with a building haptic rumble; the receiver drags a tonearm onto the
 * record to play. One drop per couple per day.
 *
 * Audio: iTunes Search API (no key, CORS-open, real 30s previews).
 * Swappable for Spotify's Web Playback SDK later — the schema already
 * stores track/artist/artwork/preview URLs.
 */

interface TrackResult {
  trackName: string;
  artistName: string;
  artworkUrl100: string;
  previewUrl?: string;
}

const HOLD_MS = 3000;

/* ---------------------------------------------------- hold-to-send */
function HoldToSend({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const tickedRef = useRef<Set<number>>(new Set());

  const stop = useCallback((completed: boolean) => {
    cancelAnimationFrame(rafRef.current);
    startRef.current = 0;
    tickedRef.current.clear();
    setProgress(0);
    if (completed) onComplete();
  }, [onComplete]);

  const loop = useCallback(() => {
    const elapsed = Date.now() - startRef.current;
    const p = Math.min(1, elapsed / HOLD_MS);
    setProgress(p);
    // building rumble: a tick at each second, a hard click at the end
    for (const at of [800, 1600, 2400]) {
      if (elapsed >= at && !tickedRef.current.has(at)) {
        tickedRef.current.add(at);
        haptic("light");
      }
    }
    if (p >= 1) {
      haptic("heavy");
      stop(true);
      return;
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [stop]);

  const down = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    startRef.current = Date.now();
    haptic("light");
    rafRef.current = requestAnimationFrame(loop);
  };

  const up = () => {
    if (startRef.current) stop(false);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const R = 26;
  const CIRC = 2 * Math.PI * R;

  return (
    <div
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      style={{ touchAction: "none" }}
      className="mx-auto flex select-none flex-col items-center gap-2"
    >
      <motion.div
        animate={{ scale: progress > 0 ? 1 + progress * 0.08 : 1 }}
        className="btn-warm relative flex h-20 w-20 items-center justify-center rounded-full"
      >
        <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(244,166,189,0.15)" strokeWidth="3" />
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke="#f4a6bd"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - progress)}
          />
        </svg>
        <Disc3 size={26} className="text-cream" />
      </motion.div>
      <p className="text-[11px] text-muted">
        {progress > 0 ? "keep holding…" : "hold for three seconds to send"}
      </p>
    </div>
  );
}

/* ------------------------------------------------------- turntable */
function Turntable({
  drop,
  onPlayed,
}: {
  drop: NeedleDrop;
  onPlayed: (d: NeedleDrop) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const armX = useMotionValue(0);
  const armRotate = useTransform(armX, [0, 120], [-32, 8]);
  const dropped = useRef(false);

  const dropNeedle = async () => {
    if (dropped.current) return;
    dropped.current = true;
    haptic("success");
    setPlaying(true);
    if (drop.preview_url) {
      const audio = new Audio(drop.preview_url);
      audioRef.current = audio;
      audio.play().catch(() => {});
      audio.onended = () => setFinished(true);
    }
    const { data } = await supabase.rpc("play_needle_drop", { drop_id: drop.id });
    if (data) onPlayed(data as NeedleDrop);
  };

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  return (
    <div className="mt-8 flex flex-col items-center">
      <p className="eyebrow">a record from them</p>
      <div className="relative mt-6 h-64 w-64">
        {/* platter */}
        <motion.div
          className="absolute inset-0 overflow-hidden rounded-full border border-blush/10 bg-[#120a10]"
          animate={{ rotate: playing ? 360 : 0 }}
          transition={playing ? { duration: 1.8, repeat: Infinity, ease: "linear" } : undefined}
          style={{
            boxShadow: "0 20px 50px -18px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(244,166,189,0.06)",
          }}
        >
          {/* grooves */}
          {[78, 62, 46].map((r) => (
            <span
              key={r}
              className="absolute rounded-full border border-cream/5"
              style={{ inset: `${(100 - r) / 2}%` }}
            />
          ))}
          {/* label / artwork — hidden until the needle drops */}
          <div className="absolute inset-[34%] overflow-hidden rounded-full">
            {playing && drop.artwork_url ? (
              <motion.img
                src={drop.artwork_url.replace("100x100", "300x300")}
                alt=""
                initial={{ filter: "blur(12px)", opacity: 0.4 }}
                animate={{ filter: "blur(0px)", opacity: 1 }}
                transition={{ duration: 1.6 }}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="card-gradient flex h-full w-full items-center justify-center">
                <Disc3 size={18} className="text-blush/70" />
              </div>
            )}
          </div>
        </motion.div>

        {/* tonearm — drag it onto the record */}
        {!playing && (
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 120 }}
            dragElastic={0.08}
            style={{ x: armX, rotate: armRotate, transformOrigin: "top right", touchAction: "none" }}
            onPointerDown={(e) => e.stopPropagation()}
            onDragEnd={() => {
              if (armX.get() > 96) dropNeedle();
              else haptic("light");
            }}
            className="absolute -right-6 -top-4 h-40 w-2 cursor-grab active:cursor-grabbing"
          >
            <span className="absolute right-0 top-0 h-5 w-5 rounded-full bg-ember-800 shadow-lg" />
            <span className="absolute right-2 top-2 block h-36 w-1 rounded-full bg-gradient-to-b from-muted to-blush-soft" />
            <span className="absolute -left-1.5 bottom-0 h-6 w-3.5 rounded-sm bg-amber-glow/90" />
          </motion.div>
        )}
      </div>

      {playing ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 text-center">
          <p className="font-serif text-xl text-cream">{drop.track_name}</p>
          <p className="mt-1 text-sm text-muted">{drop.artist_name}</p>
          {finished && <p className="mt-3 text-xs text-blush-soft">the turntable rests until tomorrow.</p>}
        </motion.div>
      ) : (
        <p className="mt-6 text-[11px] text-muted">drag the arm onto the record</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------ the screen */
export default function NeedleScreen() {
  const { tether, session, partnerProfile, sendPulse, addHeat } = useTether();
  const [drop, setDrop] = useState<NeedleDrop | null>(null);
  const [restingUntilTomorrow, setResting] = useState(false);
  const [lastPlayed, setLastPlayed] = useState<NeedleDrop | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TrackResult[]>([]);
  const [chosen, setChosen] = useState<TrackResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = session?.user.id;

  const load = useCallback(async () => {
    if (!tether) return;
    const { data } = await supabase
      .from("needle_drops")
      .select("*")
      .eq("tether_id", tether.id)
      .order("created_at", { ascending: false })
      .limit(5);
    const drops = (data as NeedleDrop[]) ?? [];
    const waiting = drops.find((d) => d.status === "waiting") ?? null;
    const playedToday =
      drops.find(
        (d) =>
          d.status === "played" &&
          d.played_at &&
          new Date(d.played_at).toDateString() === new Date().toDateString(),
      ) ?? null;
    setDrop(waiting);
    setResting(!!playedToday && !waiting);
    setLastPlayed(playedToday);
  }, [tether]);

  useEffect(() => {
    load();
    if (!tether) return;
    const ch = supabase
      .channel(`drops:${tether.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "needle_drops", filter: `tether_id=eq.${tether.id}` },
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

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    haptic("light");
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=12`,
      );
      const json = await res.json();
      setResults((json.results as TrackResult[]) ?? []);
    } catch {
      setError("couldn't reach the crate. try again.");
    }
    setSearching(false);
  };

  const send = async () => {
    if (!tether || !chosen) return;
    setError(null);
    const { error: err } = await supabase.rpc("send_needle_drop", {
      t: tether.id,
      track: chosen.trackName,
      artist: chosen.artistName,
      artwork: chosen.artworkUrl100,
      preview: chosen.previewUrl ?? null,
    });
    if (err) {
      setError(err.message);
      return;
    }
    haptic("success");
    sendPulse();
    addHeat(5);
    setChosen(null);
    setResults([]);
    setQuery("");
    load();
  };

  const partnerName = partnerProfile?.display_name ?? "them";

  return (
    <div className="h-full overflow-y-auto px-6 pb-44 safe-top">
      <header className="pt-16">
        <h2 className="font-serif text-3xl text-cream">the needle</h2>
        <p className="mt-1 text-xs text-muted">one song at a time. make it count.</p>
      </header>

      {/* a record is waiting for me */}
      {drop && drop.sender_id !== me && (
        <Turntable
          drop={drop}
          onPlayed={(d) => {
            setLastPlayed(d);
            setDrop(null);
            setResting(true);
            addHeat(4);
          }}
        />
      )}

      {/* my record is on its way */}
      {drop && drop.sender_id === me && (
        <div className="mt-10 text-center">
          <motion.div
            className="mx-auto flex h-40 w-40 items-center justify-center rounded-full border border-blush/15 bg-[#120a10]"
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          >
            <Disc3 size={28} className="text-blush/60" />
          </motion.div>
          <p className="mt-6 font-serif text-lg text-cream">“{drop.track_name}”</p>
          <p className="mt-1 text-sm text-muted">
            spinning toward {partnerName} — waiting for their needle.
          </p>
        </div>
      )}

      {/* resting */}
      {!drop && restingUntilTomorrow && (
        <div className="glass mt-10 rounded-3xl p-6 text-center">
          <p className="font-serif text-lg text-cream">the turntable is resting</p>
          {lastPlayed && (
            <p className="mt-2 text-sm text-muted">
              today's record: “{lastPlayed.track_name}” — {lastPlayed.artist_name}
            </p>
          )}
          <p className="mt-3 text-xs text-blush-soft">a new song can spin tomorrow.</p>
        </div>
      )}

      {/* crate-digging */}
      {!drop && !restingUntilTomorrow && (
        <div className="mt-8">
          <div className="glass flex items-center gap-2 rounded-full p-2 pl-5">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder={`find a song for ${partnerName}…`}
              className="flex-1 bg-transparent py-2 text-[15px] text-cream placeholder-muted outline-none"
            />
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={search}
              aria-label="search"
              className="btn-warm flex h-10 w-10 items-center justify-center rounded-full"
            >
              <Search size={16} className="text-cream" />
            </motion.button>
          </div>

          {searching && <p className="mt-6 text-center text-sm text-muted">digging through the crate…</p>}

          {/* results slide in like records */}
          {results.length > 0 && !chosen && (
            <div className="-mx-6 mt-6 flex snap-x gap-4 overflow-x-auto px-6 pb-4">
              {results.map((r, i) => (
                <motion.button
                  key={`${r.trackName}-${i}`}
                  initial={{ opacity: 0, x: 60 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    haptic("light");
                    setChosen(r);
                  }}
                  className="w-36 shrink-0 snap-center"
                >
                  <div className="relative mx-auto h-32 w-32">
                    <span className="absolute inset-0 rounded-full bg-[#120a10] shadow-xl" />
                    <img
                      src={r.artworkUrl100}
                      alt=""
                      className="absolute inset-[26%] rounded-full object-cover"
                    />
                    <span className="absolute inset-0 rounded-full border border-cream/10" />
                  </div>
                  <p className="mt-3 truncate text-xs text-cream">{r.trackName}</p>
                  <p className="truncate text-[10px] text-muted">{r.artistName}</p>
                </motion.button>
              ))}
            </div>
          )}

          {/* chosen record → hold to commit */}
          <AnimatePresence>
            {chosen && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="glass mt-8 rounded-3xl p-6 text-center"
              >
                <img
                  src={chosen.artworkUrl100.replace("100x100", "300x300")}
                  alt=""
                  className="mx-auto h-28 w-28 rounded-full object-cover shadow-xl"
                />
                <p className="mt-4 font-serif text-lg text-cream">{chosen.trackName}</p>
                <p className="mt-0.5 text-sm text-muted">{chosen.artistName}</p>
                {!chosen.previewUrl && (
                  <p className="mt-2 text-[11px] text-amber-glow/80">
                    no preview for this one — they'll see it, but it won't play.
                  </p>
                )}
                <div className="mt-6">
                  <HoldToSend onComplete={send} />
                </div>
                <button onClick={() => setChosen(null)} className="mt-5 text-xs text-muted">
                  choose another
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {error && <p className="mt-4 text-center text-sm text-blush">{error}</p>}
        </div>
      )}
    </div>
  );
}

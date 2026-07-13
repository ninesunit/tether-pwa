/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { haptic } from "../lib/haptics";
import type { PresencePayload, Profile, SpaceState, Tether } from "../lib/types";

/**
 * Ambient connection states drive the mesh-gradient background:
 *  - "dormant":  partner is not in the app  (cool charcoal / slate)
 *  - "present":  partner has the app open   (warm amber)
 *  - "near":     partner is physically close (< ~250 m) (glowing blush)
 */
export type Ambience = "dormant" | "present" | "near";

type Phase = "loading" | "signed-out" | "unpaired" | "paired";

export interface Cheer {
  text: string;
  at: number;
}

interface TetherContextValue {
  phase: Phase;
  session: Session | null;
  profile: Profile | null;
  partnerProfile: Profile | null;
  tether: Tether | null;
  partnerId: string | null;
  ambience: Ambience;
  partnerOnline: boolean;
  /** Timestamp of the last pulse received from the partner (for the ripple). */
  lastPulseAt: number | null;
  /** Last "cheer" broadcast received from the partner. */
  lastCheer: Cheer | null;
  /** Shared mood of the couple's space. */
  mood: string;
  moodSetByPartner: boolean;
  setMood: (mood: string) => Promise<void>;
  /** "Sitting together" — both partners opted into the shared ambient. */
  together: boolean;
  bothTogether: boolean;
  setTogether: (on: boolean) => void;
  sendPulse: () => void;
  sendCheer: (text: string) => void;
  signUp: (email: string, password: string, name: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  updateName: (name: string) => Promise<void>;
  createTether: () => Promise<string | null>;
  joinTether: (code: string) => Promise<string | null>;
  untether: () => Promise<void>;
  refreshTether: () => Promise<void>;
}

const TetherContext = createContext<TetherContextValue | null>(null);

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const NEARBY_METERS = 250;

export function TetherProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [partnerProfile, setPartnerProfile] = useState<Profile | null>(null);
  const [tether, setTether] = useState<Tether | null>(null);
  const [tetherLoaded, setTetherLoaded] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerNear, setPartnerNear] = useState(false);
  const [partnerTogether, setPartnerTogether] = useState(false);
  const [together, setTogetherState] = useState(false);
  const [lastPulseAt, setLastPulseAt] = useState<number | null>(null);
  const [lastCheer, setLastCheer] = useState<Cheer | null>(null);
  const [space, setSpace] = useState<SpaceState | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const myPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const togetherRef = useRef(false);
  const trackRef = useRef<(() => void) | null>(null);

  const userId = session?.user.id ?? null;
  const partnerId = useMemo(() => {
    if (!tether?.partner_b || !userId) return null;
    return tether.partner_a === userId ? tether.partner_b : tether.partner_a;
  }, [tether, userId]);

  /* ---------------------------------------------------------------- auth */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  /* ------------------------------------------------- profile + tether row
     A user can transiently own multiple tether rows (created a code, then
     joined a partner's). Fetch them all and prefer the completed pair —
     this is what previously made one side look "untethered". */
  const refreshTether = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setTether(null);
      setTetherLoaded(false);
      return;
    }
    const [{ data: prof }, { data: rows }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("tethers")
        .select("*")
        .or(`partner_a.eq.${userId},partner_b.eq.${userId}`)
        .order("created_at", { ascending: false }),
    ]);
    setProfile((prof as Profile) ?? null);
    const all = (rows as Tether[]) ?? [];
    setTether(all.find((r) => r.partner_b) ?? all[0] ?? null);
    setTetherLoaded(true);
  }, [userId]);

  useEffect(() => {
    refreshTether();
  }, [refreshTether]);

  // Re-check whenever the app returns to the foreground (iOS PWAs sleep hard).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshTether();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshTether]);

  /* -------------------------------------------------------- partner info */
  useEffect(() => {
    if (!partnerId) {
      setPartnerProfile(null);
      return;
    }
    supabase
      .from("profiles")
      .select("*")
      .eq("id", partnerId)
      .maybeSingle()
      .then(({ data }) => setPartnerProfile((data as Profile) ?? null));
  }, [partnerId]);

  /* ------------------- watch the tether row: pairing + partner untethers */
  useEffect(() => {
    if (!tether || !userId) return;
    const ch = supabase
      .channel(`tether-row:${tether.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tethers", filter: `id=eq.${tether.id}` },
        (payload) => {
          setTether(payload.new as Tether);
          haptic("success");
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "tethers", filter: `id=eq.${tether.id}` },
        () => {
          setTether(null);
          setSpace(null);
          refreshTether();
        },
      )
      .subscribe();

    // Belt & suspenders while waiting for a partner: realtime can drop on
    // mobile Safari, so poll gently until the pair completes.
    let poll: number | null = null;
    if (!tether.partner_b) {
      poll = window.setInterval(refreshTether, 10_000);
    }
    return () => {
      supabase.removeChannel(ch);
      if (poll !== null) clearInterval(poll);
    };
  }, [tether, userId, refreshTether]);

  /* ----------------------------------------------- shared space (mood) */
  useEffect(() => {
    if (!tether?.partner_b) {
      setSpace(null);
      return;
    }
    supabase
      .from("space_state")
      .select("*")
      .eq("tether_id", tether.id)
      .maybeSingle()
      .then(({ data }) => setSpace((data as SpaceState) ?? null));
    const ch = supabase
      .channel(`space:${tether.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "space_state", filter: `tether_id=eq.${tether.id}` },
        (payload) => {
          if (payload.eventType !== "DELETE") setSpace(payload.new as SpaceState);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tether]);

  /* --------------------------------------- presence + pulse (broadcast) */
  useEffect(() => {
    if (!tether?.partner_b || !userId) return;

    const channel = supabase.channel(`tether:${tether.id}`, {
      config: { presence: { key: userId }, broadcast: { self: false } },
    });
    channelRef.current = channel;

    const track = () =>
      channel.track({
        user_id: userId,
        lat: myPositionRef.current?.lat ?? null,
        lng: myPositionRef.current?.lng ?? null,
        together: togetherRef.current,
        online_at: new Date().toISOString(),
      } satisfies PresencePayload);

    const evaluatePresence = () => {
      const state = channel.presenceState<PresencePayload>();
      const others = Object.keys(state).filter((k) => k !== userId);
      const online = others.length > 0;
      setPartnerOnline(online);

      let near = false;
      let ptogether = false;
      const mine = myPositionRef.current;
      for (const key of others) {
        for (const meta of state[key]) {
          ptogether ||= !!meta.together;
          if (mine && meta.lat != null && meta.lng != null) {
            near ||= haversineMeters(mine, { lat: meta.lat, lng: meta.lng }) < NEARBY_METERS;
          }
        }
      }
      setPartnerNear(online && near);
      setPartnerTogether(online && ptogether);
    };

    channel
      .on("presence", { event: "sync" }, evaluatePresence)
      .on("presence", { event: "leave" }, evaluatePresence)
      .on("broadcast", { event: "pulse" }, () => {
        setLastPulseAt(Date.now());
        haptic("pulse");
      })
      .on("broadcast", { event: "cheer" }, ({ payload }) => {
        setLastCheer({ text: (payload as { text?: string })?.text ?? "", at: Date.now() });
        haptic("success");
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await track();
      });

    // expose so setTogether can re-track
    trackRef.current = track;

    // Coarse position for the "near each other" glow. Optional — the app
    // degrades gracefully if the user never grants location.
    let watchId: number | null = null;
    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          myPositionRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          track();
        },
        () => {
          /* permission denied — presence still works, proximity doesn't */
        },
        { enableHighAccuracy: false, maximumAge: 60_000 },
      );
    }

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      supabase.removeChannel(channel);
      channelRef.current = null;
      trackRef.current = null;
      setPartnerOnline(false);
      setPartnerNear(false);
      setPartnerTogether(false);
    };
  }, [tether, userId]);

  /* ------------------------------------------------------------- actions */
  const sendPulse = useCallback(() => {
    haptic("medium");
    channelRef.current?.send({ type: "broadcast", event: "pulse", payload: {} });
  }, []);

  const sendCheer = useCallback((text: string) => {
    haptic("light");
    channelRef.current?.send({ type: "broadcast", event: "cheer", payload: { text } });
  }, []);

  const setTogether = useCallback((on: boolean) => {
    togetherRef.current = on;
    setTogetherState(on);
    trackRef.current?.();
  }, []);

  const setMood = useCallback(
    async (mood: string) => {
      if (!tether || !userId) return;
      haptic("light");
      setSpace({ tether_id: tether.id, mood, updated_by: userId, updated_at: new Date().toISOString() });
      await supabase
        .from("space_state")
        .upsert({ tether_id: tether.id, mood, updated_by: userId, updated_at: new Date().toISOString() });
    },
    [tether, userId],
  );

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return error.message;
    if (data.user) {
      const { error: pErr } = await supabase
        .from("profiles")
        .upsert({ id: data.user.id, display_name: name });
      if (pErr) return pErr.message;
    }
    return null;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setTether(null);
    setSpace(null);
  }, []);

  const updateName = useCallback(
    async (name: string) => {
      if (!userId || !name.trim()) return;
      await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", userId);
      setProfile((p) => (p ? { ...p, display_name: name.trim() } : p));
    },
    [userId],
  );

  /** Server-side: reuses a pending code, refuses if already paired. */
  const createTether = useCallback(async () => {
    const { data, error } = await supabase.rpc("create_tether");
    if (error) return error.message;
    if (data) setTether(data as Tether);
    return null;
  }, []);

  const joinTether = useCallback(
    async (code: string) => {
      if (!userId) return "Not signed in.";
      const { data, error } = await supabase.rpc("join_tether", {
        join_code: code.trim().toUpperCase(),
      });
      if (error) return error.message;
      if (!data) return "That code wasn't found, or it was already used.";
      await refreshTether();
      return null;
    },
    [userId, refreshTether],
  );

  const untether = useCallback(async () => {
    await supabase.rpc("untether");
    setTether(null);
    setSpace(null);
    setPartnerProfile(null);
    await refreshTether();
  }, [refreshTether]);

  const ambience: Ambience = partnerNear ? "near" : partnerOnline ? "present" : "dormant";

  const phase: Phase = !authReady
    ? "loading"
    : !session
      ? "signed-out"
      : !tetherLoaded
        ? "loading"
        : tether?.partner_b
          ? "paired"
          : "unpaired";

  const value: TetherContextValue = {
    phase,
    session,
    profile,
    partnerProfile,
    tether,
    partnerId,
    ambience,
    partnerOnline,
    lastPulseAt,
    lastCheer,
    mood: space?.mood ?? "calm",
    moodSetByPartner: !!space && space.updated_by !== userId,
    setMood,
    together,
    bothTogether: together && partnerTogether,
    setTogether,
    sendPulse,
    sendCheer,
    signUp,
    signIn,
    signOut,
    updateName,
    createTether,
    joinTether,
    untether,
    refreshTether,
  };

  return <TetherContext.Provider value={value}>{children}</TetherContext.Provider>;
}

export function useTether() {
  const ctx = useContext(TetherContext);
  if (!ctx) throw new Error("useTether must be used inside <TetherProvider>");
  return ctx;
}

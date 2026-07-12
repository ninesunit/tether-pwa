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
import type { PresenceState, Profile, Tether } from "../lib/types";

/**
 * Ambient connection states drive the mesh-gradient background:
 *  - "dormant":  partner is not in the app  (cool charcoal / slate)
 *  - "present":  partner has the app open   (warm amber)
 *  - "near":     partner is physically close (< ~250 m) (glowing blush)
 */
export type Ambience = "dormant" | "present" | "near";

type Phase = "loading" | "signed-out" | "unpaired" | "paired";

interface TetherContextValue {
  phase: Phase;
  session: Session | null;
  profile: Profile | null;
  tether: Tether | null;
  partnerId: string | null;
  ambience: Ambience;
  partnerOnline: boolean;
  /** Timestamp of the last pulse received from the partner (for the ripple). */
  lastPulseAt: number | null;
  sendPulse: () => void;
  signUp: (email: string, password: string, name: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  createTether: () => Promise<Tether | null>;
  joinTether: (code: string) => Promise<string | null>;
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
  const [tether, setTether] = useState<Tether | null>(null);
  const [tetherLoaded, setTetherLoaded] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerNear, setPartnerNear] = useState(false);
  const [lastPulseAt, setLastPulseAt] = useState<number | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const myPositionRef = useRef<{ lat: number; lng: number } | null>(null);

  const userId = session?.user.id ?? null;
  const partnerId = useMemo(() => {
    if (!tether || !userId) return null;
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

  /* ------------------------------------------------- profile + tether row */
  const refreshTether = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setTether(null);
      setTetherLoaded(false);
      return;
    }
    const [{ data: prof }, { data: pair }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("tethers")
        .select("*")
        .or(`partner_a.eq.${userId},partner_b.eq.${userId}`)
        .maybeSingle(),
    ]);
    setProfile((prof as Profile) ?? null);
    setTether((pair as Tether) ?? null);
    setTetherLoaded(true);
  }, [userId]);

  useEffect(() => {
    refreshTether();
  }, [refreshTether]);

  /* -------------------------- while waiting for a partner, watch the row */
  useEffect(() => {
    if (!tether || tether.partner_b) return;
    const ch = supabase
      .channel(`tether-row:${tether.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tethers", filter: `id=eq.${tether.id}` },
        (payload) => setTether(payload.new as Tether),
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

    const evaluatePresence = () => {
      const state = channel.presenceState<PresenceState>();
      const others = Object.keys(state).filter((k) => k !== userId);
      const online = others.length > 0;
      setPartnerOnline(online);

      let near = false;
      const mine = myPositionRef.current;
      if (online && mine) {
        for (const key of others) {
          for (const meta of state[key]) {
            if (meta.lat != null && meta.lng != null) {
              near ||= haversineMeters(mine, { lat: meta.lat, lng: meta.lng }) < NEARBY_METERS;
            }
          }
        }
      }
      setPartnerNear(near);
    };

    channel
      .on("presence", { event: "sync" }, evaluatePresence)
      .on("presence", { event: "leave" }, evaluatePresence)
      .on("broadcast", { event: "pulse" }, () => {
        setLastPulseAt(Date.now());
        haptic("pulse");
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: userId,
            lat: myPositionRef.current?.lat ?? null,
            lng: myPositionRef.current?.lng ?? null,
            online_at: new Date().toISOString(),
          } satisfies PresenceState);
        }
      });

    // Coarse position for the "near each other" glow. Optional — the app
    // degrades gracefully if the user never grants location.
    let watchId: number | null = null;
    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          myPositionRef.current = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          channel.track({
            user_id: userId,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            online_at: new Date().toISOString(),
          } satisfies PresenceState);
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
      setPartnerOnline(false);
      setPartnerNear(false);
    };
  }, [tether, userId]);

  /* ------------------------------------------------------------- actions */
  const sendPulse = useCallback(() => {
    haptic("medium");
    channelRef.current?.send({ type: "broadcast", event: "pulse", payload: {} });
  }, []);

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
  }, []);

  const createTether = useCallback(async () => {
    if (!userId) return null;
    // Human-friendly one-time code, e.g. "EMBER-4821".
    const words = ["EMBER", "BLUSH", "DUSK", "VELVET", "AMBER", "MOTH", "PLUM", "WREN"];
    const code = `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(
      1000 + Math.random() * 9000,
    )}`;
    const { data, error } = await supabase
      .from("tethers")
      .insert({ code, partner_a: userId })
      .select()
      .single();
    if (error || !data) return null;
    setTether(data as Tether);
    return data as Tether;
  }, [userId]);

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
    tether,
    partnerId,
    ambience,
    partnerOnline,
    lastPulseAt,
    sendPulse,
    signUp,
    signIn,
    signOut,
    createTether,
    joinTether,
    refreshTether,
  };

  return <TetherContext.Provider value={value}>{children}</TetherContext.Provider>;
}

export function useTether() {
  const ctx = useContext(TetherContext);
  if (!ctx) throw new Error("useTether must be used inside <TetherProvider>");
  return ctx;
}

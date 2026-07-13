import { useCallback, useEffect, useRef, useState } from "react";
import { Compass } from "lucide-react";
import { useTether } from "../context/TetherContext";
import { haptic } from "../lib/haptics";

/**
 * The Tether Line — a geographic string stretched across the whole screen,
 * always aimed at the partner's real-world position. It hangs with real
 * rope physics: an underdamped spring makes it sway idle, bend when either
 * partner grabs it (synced live over Broadcast), and wobble back when
 * released — with a heavy haptic snap on the other phone.
 *
 * Rendering is a plain SVG path updated from a requestAnimationFrame
 * physics loop (no motion-value SVG attributes — those proved unreliable).
 */

const SEND_INTERVAL_MS = 66;
const FALLBACK_ANGLE = -32; // aesthetic diagonal before a location fix exists

function bearingDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function distanceText(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const m = 2 * R * Math.asin(Math.sqrt(s));
  if (m < 1000) return `${Math.round(m)} m`;
  if (m < 100_000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000)} km`;
}

type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export default function TetherLine() {
  const { broadcast, onBroadcast, myLocation, partnerLocation, partnerProfile } = useTether();

  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [heading, setHeading] = useState<number | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [, setFrame] = useState(0); // ticks every physics frame

  // physics state lives in refs — mutated at 60fps, rendered via setFrame
  const cpRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const velRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const remoteUntilRef = useRef(0);
  const lastSendRef = useRef(0);
  const angleRef = useRef(FALLBACK_ANGLE);
  const vpRef = useRef(vp);
  vpRef.current = vp;

  /* --------------------------------------------------------- viewport */
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* ---------------------------------------------------------- compass */
  const attachOrientation = useCallback(() => {
    const handler = (e: DeviceOrientationEvent) => {
      const webkitHeading = (e as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading;
      if (webkitHeading != null) setHeading(webkitHeading);
      else if (e.absolute && e.alpha != null) setHeading(360 - e.alpha);
    };
    window.addEventListener("deviceorientation", handler, true);
    return () => window.removeEventListener("deviceorientation", handler, true);
  }, []);

  useEffect(() => {
    const Ctor = (window.DeviceOrientationEvent ?? null) as OrientationCtor | null;
    if (!Ctor) return;
    if (typeof Ctor.requestPermission === "function") {
      // iOS 13+: the compass must be unlocked by an explicit user tap.
      setNeedsPermission(true);
      return;
    }
    return attachOrientation();
  }, [attachOrientation]);

  const requestCompass = useCallback(async () => {
    haptic("light");
    const Ctor = window.DeviceOrientationEvent as OrientationCtor;
    try {
      const res = await Ctor.requestPermission!();
      if (res === "granted") {
        setNeedsPermission(false);
        attachOrientation();
      }
    } catch {
      /* user dismissed the native prompt */
    }
  }, [attachOrientation]);

  /* -------------------------------------------------- geometry (render) */
  const hasFix = !!myLocation && !!partnerLocation;
  const bearing = hasFix ? bearingDeg(myLocation!, partnerLocation!) : null;
  // screen rotation: bearing relative to where the device is pointing;
  // without a compass fix we still aim by raw bearing (assumes north-up).
  const angle = bearing !== null ? (heading !== null ? bearing - heading : bearing) : FALLBACK_ANGLE;
  angleRef.current = angle;

  const rad = (angle * Math.PI) / 180;
  // compass angle → screen vector (0° = up/north)
  const dir = { x: Math.sin(rad), y: -Math.cos(rad) };
  const C = { x: vp.w / 2, y: vp.h / 2 };
  const L = Math.hypot(vp.w, vp.h) / 2 + 80;
  const A = { x: C.x - dir.x * L, y: C.y - dir.y * L };
  const B = { x: C.x + dir.x * L, y: C.y + dir.y * L };
  // the bead marks where the string leaves toward the partner
  const beadDist = Math.min(vp.w, vp.h) / 2 - 64;
  const bead = { x: C.x + dir.x * beadDist, y: C.y + dir.y * beadDist };

  /* ------------------------------------------------------ physics loop */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const { w, h } = vpRef.current;
      const cx = w / 2;
      const cy = h / 2;

      if (!draggingRef.current && now > remoteUntilRef.current) {
        // idle sway target: a slow breath perpendicular to the string
        const a = ((angleRef.current + 90) * Math.PI) / 180;
        const sway = Math.sin(now / 1400) * 12;
        const tx = cx + Math.sin(a) * sway;
        const ty = cy - Math.cos(a) * sway;
        // underdamped spring — visible wobble on release
        const k = 90;
        const damp = 7;
        velRef.current.x += (k * (tx - cpRef.current.x) - damp * velRef.current.x) * dt;
        velRef.current.y += (k * (ty - cpRef.current.y) - damp * velRef.current.y) * dt;
        cpRef.current.x += velRef.current.x * dt;
        cpRef.current.y += velRef.current.y * dt;
      }
      setFrame((f) => (f + 1) % 100000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* --------------------------------------------------- incoming events */
  useEffect(() => {
    const offLine = onBroadcast("line", (p) => {
      if (draggingRef.current) return; // your own hand wins while touching
      const ox = Number(p.ox);
      const oy = Number(p.oy);
      if (!Number.isFinite(ox) || !Number.isFinite(oy)) return;
      const { w, h } = vpRef.current;
      const half = Math.min(w, h) / 2;
      // mirrored: their pull comes from the other side of the string
      cpRef.current = { x: w / 2 - ox * half, y: h / 2 + oy * half };
      velRef.current = { x: 0, y: 0 };
      remoteUntilRef.current = performance.now() + 260;
    });
    const offSnap = onBroadcast("line_snap", () => {
      remoteUntilRef.current = 0; // spring takes over → wobble
      haptic("heavy");
    });
    return () => {
      offLine();
      offSnap();
    };
  }, [onBroadcast]);

  /* ------------------------------------------------------- local drag */
  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    cpRef.current = { x: e.clientX, y: e.clientY };
    velRef.current = { x: 0, y: 0 };
    haptic("light");
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    cpRef.current = { x: e.clientX, y: e.clientY };
    const now = Date.now();
    if (now - lastSendRef.current > SEND_INTERVAL_MS) {
      lastSendRef.current = now;
      const { w, h } = vpRef.current;
      const half = Math.min(w, h) / 2;
      broadcast("line", {
        ox: (e.clientX - w / 2) / half,
        oy: (e.clientY - h / 2) / half,
      });
    }
  };

  const release = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    draggingRef.current = false;
    haptic("medium");
    broadcast("line_snap", {});
  };

  /* ------------------------------------------------------------ render */
  const cp = cpRef.current;
  const d = `M ${A.x.toFixed(1)} ${A.y.toFixed(1)} Q ${cp.x.toFixed(1)} ${cp.y.toFixed(1)} ${B.x.toFixed(1)} ${B.y.toFixed(1)}`;
  const partnerName = partnerProfile?.display_name ?? "them";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg width={vp.w} height={vp.h} className="absolute inset-0">
        <defs>
          <linearGradient
            id="line-grad"
            gradientUnits="userSpaceOnUse"
            x1={A.x}
            y1={A.y}
            x2={B.x}
            y2={B.y}
          >
            <stop offset="0%" stopColor="#f2b263" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#f4a6bd" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#f2b263" stopOpacity="0.7" />
          </linearGradient>
        </defs>
        {/* soft glow underlay */}
        <path
          d={d}
          fill="none"
          stroke="#f4a6bd"
          strokeWidth="7"
          strokeLinecap="round"
          opacity="0.16"
          style={{ filter: "blur(7px)" }}
        />
        {/* the string */}
        <path d={d} fill="none" stroke="url(#line-grad)" strokeWidth="2" strokeLinecap="round" />
        {/* partner bead at the far end */}
        <circle cx={bead.x} cy={bead.y} r="5" fill="#f4a6bd">
          <animate attributeName="opacity" values="0.6;1;0.6" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx={bead.x} cy={bead.y} r="11" fill="none" stroke="#f4a6bd" strokeOpacity="0.35" />
        {/* generous invisible grab area — the only interactive part */}
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth="60"
          style={{ pointerEvents: "stroke", touchAction: "none", cursor: "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={release}
          onPointerCancel={release}
        />
      </svg>

      {/* bead label: who's at the end of the string, and how far */}
      {hasFix && (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
          style={{
            left: Math.min(vp.w - 70, Math.max(70, bead.x)),
            top: Math.min(vp.h - 120, Math.max(90, bead.y + 26)),
          }}
        >
          <p className="text-[11px] text-blush-soft">{partnerName.toLowerCase()}</p>
          <p className="text-[10px] text-muted">{distanceText(myLocation!, partnerLocation!)}</p>
        </div>
      )}

      {/* compass unlock (iOS) */}
      {needsPermission && hasFix && (
        <button
          onClick={requestCompass}
          className="glass pointer-events-auto absolute bottom-[13.5rem] left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] text-blush-soft"
        >
          <Compass size={11} />
          point the line at {partnerName.toLowerCase()}
        </button>
      )}
    </div>
  );
}

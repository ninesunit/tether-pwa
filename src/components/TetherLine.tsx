import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { Compass } from "lucide-react";
import { useTether } from "../context/TetherContext";
import { haptic } from "../lib/haptics";

/**
 * The Tether Line — a glowing string spanning the screen that both partners
 * share. Pull it like a bowstring: your partner watches it bend live
 * (Supabase Broadcast at ~15 msg/s); let go and it snaps back, thudding the
 * Taptic Engine on their side. The whole line rotates to point at the
 * partner's real-world direction (compass bearing) once permission is given.
 */

const W = 400;
const H = 180;
const CX = W / 2;
const CY = H / 2;
const SEND_INTERVAL_MS = 66;

/** Initial bearing (deg from north) from a → b along a great circle. */
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
  if (m < 1000) return `${Math.round(m)} m apart`;
  if (m < 100_000) return `${(m / 1000).toFixed(1)} km apart`;
  return `${Math.round(m / 1000)} km apart`;
}

type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export default function TetherLine() {
  const { broadcast, onBroadcast, myLocation, partnerLocation, partnerProfile } = useTether();
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  const lastSendRef = useRef(0);

  const cx = useSpring(CX, { stiffness: 340, damping: 11 });
  const cy = useSpring(CY, { stiffness: 340, damping: 11 });
  const d = useTransform([cx, cy], ([x, y]) => `M 22 ${CY} Q ${x} ${y} ${W - 22} ${CY}`);

  const [heading, setHeading] = useState<number | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [snapped, setSnapped] = useState(0);

  /* ------------------------------------------------ compass permission */
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
      // iOS 13+: must be unlocked by an explicit user tap.
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

  /* --------------------------------------------------- incoming events */
  useEffect(() => {
    const offLine = onBroadcast("line", (p) => {
      if (draggingRef.current) return; // your own pull wins while touching
      const x = Number(p.x);
      const y = Number(p.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        // mirror horizontally: they pull from "their side" of the string
        cx.jump(W - x);
        cy.jump(y);
      }
    });
    const offSnap = onBroadcast("line_snap", () => {
      cx.set(CX);
      cy.set(CY);
      haptic("heavy");
      setSnapped(Date.now());
    });
    return () => {
      offLine();
      offSnap();
    };
  }, [onBroadcast, cx, cy]);

  /* ------------------------------------------------------ local drag */
  const toLocal = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = Math.min(W - 30, Math.max(30, ((e.clientX - rect.left) / rect.width) * W));
    const y = Math.min(H - 8, Math.max(8, ((e.clientY - rect.top) / rect.height) * H));
    return { x, y };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    const { x, y } = toLocal(e);
    cx.jump(x);
    cy.jump(y);
    haptic("light");
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    const { x, y } = toLocal(e);
    cx.jump(x);
    cy.jump(y);
    const now = Date.now();
    if (now - lastSendRef.current > SEND_INTERVAL_MS) {
      lastSendRef.current = now;
      broadcast("line", { x: Math.round(x), y: Math.round(y) });
    }
  };

  const release = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    draggingRef.current = false;
    cx.set(CX);
    cy.set(CY);
    haptic("medium");
    broadcast("line_snap", {});
    setSnapped(Date.now());
  };

  /* ------------------------------------------------------------ render */
  const hasFix = !!myLocation && !!partnerLocation;
  const bearing = hasFix ? bearingDeg(myLocation!, partnerLocation!) : null;
  const rotation = bearing !== null && heading !== null ? bearing - heading : 0;

  return (
    <div className="relative w-full select-none">
      <motion.div
        animate={{ rotate: rotation }}
        transition={{ type: "spring", damping: 30, stiffness: 60 }}
        className="w-full"
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={release}
          onPointerCancel={release}
        >
          <defs>
            <linearGradient id="line-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#f2b263" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#f4a6bd" />
              <stop offset="100%" stopColor="#f2b263" stopOpacity="0.9" />
            </linearGradient>
            <filter id="line-glow" x="-40%" y="-200%" width="180%" height="500%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* endpoints */}
          <circle cx="22" cy={CY} r="4.5" fill="#f2b263" opacity="0.9" />
          <circle cx={W - 22} cy={CY} r="4.5" fill="#f4a6bd" opacity="0.9" />
          {/* the string itself */}
          <motion.path
            d={d}
            fill="none"
            stroke="url(#line-grad)"
            strokeWidth={2.5}
            strokeLinecap="round"
            filter="url(#line-glow)"
            animate={{ opacity: snapped && Date.now() - snapped < 600 ? [1, 0.4, 1] : 1 }}
          />
          {/* generous invisible hit area */}
          <motion.path d={d} fill="none" stroke="transparent" strokeWidth={44} />
        </svg>
      </motion.div>

      <div className="mt-1 flex items-center justify-center gap-3">
        <p className="text-[11px] text-muted">
          {hasFix
            ? `${distanceText(myLocation!, partnerLocation!)} · pull the line`
            : "pull the line — it snaps in their hands"}
        </p>
        {needsPermission && hasFix && (
          <button
            onClick={requestCompass}
            className="glass flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] text-blush-soft"
          >
            <Compass size={11} />
            aim at {partnerProfile?.display_name.toLowerCase() ?? "them"}
          </button>
        )}
      </div>
    </div>
  );
}

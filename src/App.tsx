import { useEffect, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { MessageCircle, Images, Sparkles, Ticket, Route } from "lucide-react";
import { TetherProvider, useTether } from "./context/TetherContext";
import AmbientBackground from "./components/AmbientBackground";
import AuthScreen from "./screens/AuthScreen";
import PairingScreen from "./screens/PairingScreen";
import PulseScreen from "./screens/PulseScreen";
import ChatScreen from "./screens/ChatScreen";
import MemoriesScreen from "./screens/MemoriesScreen";
import BridgeScreen from "./screens/BridgeScreen";
import TokensScreen from "./screens/TokensScreen";
import PathScreen from "./screens/PathScreen";
import { haptic } from "./lib/haptics";

const rooms = [
  { key: "chat", label: "chat", icon: MessageCircle, el: <ChatScreen /> },
  { key: "wall", label: "wall", icon: Images, el: <MemoriesScreen /> },
  { key: "pulse", label: "pulse", icon: null, el: <PulseScreen /> },
  { key: "bridge", label: "bridge", icon: Sparkles, el: <BridgeScreen /> },
  { key: "tokens", label: "tokens", icon: Ticket, el: <TokensScreen /> },
  { key: "path", label: "path", icon: Route, el: <PathScreen /> },
] as const;

const PULSE_INDEX = 2;

/** Toast shown when the partner cheers a shared goal. */
function CheerToast() {
  const { lastCheer, partnerProfile } = useTether();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!lastCheer) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 4200);
    return () => clearTimeout(t);
  }, [lastCheer]);

  return (
    <AnimatePresence>
      {visible && lastCheer && (
        <motion.div
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          className="glass-strong fixed left-1/2 top-14 z-50 -translate-x-1/2 rounded-full px-5 py-3 safe-top"
        >
          <p className="text-sm text-cream">
            <span className="text-blush">{partnerProfile?.display_name ?? "they"}</span> cheered
            you on{lastCheer.text ? ` — ${lastCheer.text}` : ""} 🤍
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PairedApp() {
  const [index, setIndex] = useState(PULSE_INDEX);
  const [direction, setDirection] = useState(0);

  const go = (next: number) => {
    if (next < 0 || next >= rooms.length || next === index) return;
    setDirection(next > index ? 1 : -1);
    setIndex(next);
    haptic("light");
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -70 || info.velocity.x < -400) go(index + 1);
    else if (info.offset.x > 70 || info.velocity.x > 400) go(index - 1);
  };

  return (
    <div className="relative h-full overflow-hidden">
      <CheerToast />
      <AnimatePresence mode="popLayout" custom={direction} initial={false}>
        <motion.div
          key={rooms[index].key}
          className="h-full"
          custom={direction}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={onDragEnd}
          initial={{ x: direction > 0 ? 80 : -80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: direction > 0 ? -80 : 80, opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 260 }}
        >
          {rooms[index].el}
        </motion.div>
      </AnimatePresence>

      {/* floating glass nav — the pulse orb sits at its center */}
      <nav className="glass-strong fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full px-3 py-2 safe-bottom">
        {rooms.map((r, i) => {
          const active = i === index;
          if (r.key === "pulse") {
            return (
              <button
                key={r.key}
                onClick={() => go(i)}
                aria-label="pulse"
                className="relative mx-1 flex h-12 w-12 items-center justify-center"
              >
                <motion.span
                  className="block h-9 w-9 rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle at 35% 30%, #c65a82 0%, #7a2244 60%, #3c1c2c 100%)",
                  }}
                  animate={{
                    scale: active ? [1, 1.12, 1] : 1,
                    boxShadow: active
                      ? "0 0 26px 6px rgba(244,166,189,0.35)"
                      : "0 0 12px 2px rgba(122,34,68,0.4)",
                  }}
                  transition={
                    active ? { duration: 2.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }
                  }
                />
              </button>
            );
          }
          const Icon = r.icon!;
          return (
            <button
              key={r.key}
              onClick={() => go(i)}
              aria-label={r.label}
              className="relative flex h-11 w-11 items-center justify-center rounded-full"
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-full bg-blush/15"
                  transition={{ type: "spring", damping: 26, stiffness: 300 }}
                />
              )}
              <Icon
                size={19}
                strokeWidth={1.8}
                className={active ? "relative text-blush" : "relative text-muted"}
              />
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function Router() {
  const { phase } = useTether();
  return (
    <>
      <AmbientBackground />
      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          className="h-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          {phase === "loading" && (
            <div className="flex h-full items-center justify-center">
              <motion.div
                className="h-3 w-3 rounded-full bg-blush"
                animate={{ opacity: [0.3, 1, 0.3], scale: [1, 1.4, 1] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              />
            </div>
          )}
          {phase === "signed-out" && <AuthScreen />}
          {phase === "unpaired" && <PairingScreen />}
          {phase === "paired" && <PairedApp />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

export default function App() {
  return (
    <TetherProvider>
      <Router />
    </TetherProvider>
  );
}

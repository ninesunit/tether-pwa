import { useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { TetherProvider, useTether } from "./context/TetherContext";
import AmbientBackground from "./components/AmbientBackground";
import AuthScreen from "./screens/AuthScreen";
import PairingScreen from "./screens/PairingScreen";
import PulseScreen from "./screens/PulseScreen";
import InboxScreen from "./screens/InboxScreen";
import MemoriesScreen from "./screens/MemoriesScreen";
import BridgeScreen from "./screens/BridgeScreen";
import TokensScreen from "./screens/TokensScreen";
import PathScreen from "./screens/PathScreen";
import { haptic } from "./lib/haptics";

/**
 * No nav bars, no menus. Horizontal swipes move between the five rooms;
 * the Pulse sits at the center. Soft dots at the bottom are the only chrome.
 */
const rooms = [
  { key: "letters", el: <InboxScreen /> },
  { key: "memories", el: <MemoriesScreen /> },
  { key: "pulse", el: <PulseScreen /> },
  { key: "bridge", el: <BridgeScreen /> },
  { key: "tokens", el: <TokensScreen /> },
  { key: "path", el: <PathScreen /> },
] as const;

const PULSE_INDEX = 2;

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

      {/* the only persistent chrome: six soft dots */}
      <div className="pointer-events-auto fixed bottom-8 left-1/2 flex -translate-x-1/2 gap-3 safe-bottom">
        {rooms.map((r, i) => (
          <button key={r.key} onClick={() => go(i)} aria-label={r.key} className="p-1.5">
            <motion.span
              className="block rounded-full"
              animate={{
                width: i === index ? 18 : 6,
                height: 6,
                backgroundColor: i === index ? "#e8a4b8" : "#8a7580",
                opacity: i === index ? 1 : 0.45,
              }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
            />
          </button>
        ))}
      </div>
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

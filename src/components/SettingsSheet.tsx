import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, Unlink, Vibrate } from "lucide-react";
import { useTether } from "../context/TetherContext";
import { haptic } from "../lib/haptics";
import { useKeyboardInset } from "../lib/useKeyboardInset";

export default function SettingsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { profile, partnerProfile, updateName, signOut, untether } = useTether();
  const [name, setName] = useState(profile?.display_name ?? "");
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  const keyboardInset = useKeyboardInset();

  const saveName = async () => {
    if (name.trim() && name.trim() !== profile?.display_name) {
      haptic("light");
      await updateName(name);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-void/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="glass-strong fixed inset-x-0 bottom-0 z-50 rounded-t-[2rem] p-6 pb-12 safe-bottom"
            style={keyboardInset > 0 ? { bottom: keyboardInset } : undefined}
          >
            <div className="mx-auto mb-6 h-1 w-10 rounded-full bg-muted/40" />
            <p className="font-serif text-xl text-cream">your half</p>

            <p className="eyebrow mt-6">your name</p>
            <div className="mt-2 flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
                className="field flex-1 rounded-2xl px-4 py-3 text-cream outline-none"
              />
            </div>

            {partnerProfile && (
              <>
                <p className="eyebrow mt-6">tethered to</p>
                <div className="mt-2 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-burgundy/60 font-serif text-blush">
                    {partnerProfile.display_name.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-cream">{partnerProfile.display_name}</span>
                </div>
              </>
            )}

            <div className="mt-10 space-y-3">
              <button
                onClick={() => haptic("heavy")}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ember-900/70 py-3.5 text-sm text-blush-soft"
              >
                <Vibrate size={15} /> test haptics
              </button>
              <button
                disabled={unlinking}
                onClick={async () => {
                  haptic("light");
                  if (!confirmUnlink) {
                    setConfirmUnlink(true);
                    return;
                  }
                  setUnlinking(true);
                  setUnlinkError(null);
                  const err = await untether();
                  setUnlinking(false);
                  setConfirmUnlink(false);
                  if (err) setUnlinkError(err);
                  else onClose();
                }}
                className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm transition-colors disabled:opacity-50 ${
                  confirmUnlink ? "bg-burgundy text-cream" : "bg-ember-900/70 text-blush-soft"
                }`}
              >
                <Unlink size={15} />
                {unlinking
                  ? "untethering…"
                  : confirmUnlink
                    ? "tap again — this deletes everything you share"
                    : "untether"}
              </button>
              {unlinkError && (
                <p className="px-1 text-center text-xs text-blush">{unlinkError}</p>
              )}
              <button
                onClick={() => signOut()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ember-900/70 py-3.5 text-sm text-muted"
              >
                <LogOut size={15} /> sign out
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

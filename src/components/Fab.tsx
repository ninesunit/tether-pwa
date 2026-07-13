import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { haptic } from "../lib/haptics";

/**
 * The one floating action button style, shared by every room —
 * solid warm gradient, crisp border, deep shadow, clear of the nav bar.
 */
export default function Fab({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.94 }}
      disabled={disabled}
      onClick={() => {
        haptic("light");
        onClick();
      }}
      className="fab fixed bottom-[7rem] left-1/2 z-30 -translate-x-1/2 safe-bottom"
    >
      <Icon size={15} strokeWidth={2} className="text-blush" />
      <span>{label}</span>
    </motion.button>
  );
}

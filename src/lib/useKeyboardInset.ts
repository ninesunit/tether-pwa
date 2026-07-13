import { useEffect, useState } from "react";

/**
 * Height (px) of the on-screen keyboard currently covering the layout
 * viewport. iOS overlays the keyboard on top of fixed-bottom elements —
 * sheets and composers add this as extra bottom offset so inputs stay
 * visible while typing. 0 when the keyboard is closed (or unsupported).
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setInset(covered > 60 ? Math.round(covered) : 0);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}

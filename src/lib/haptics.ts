/**
 * The iOS Haptic Engine.
 *
 * Safari on iOS blocks `navigator.vibrate`, but as of iOS 17.4 WebKit fires a
 * real Taptic Engine tick whenever an `<input type="checkbox" switch>` is
 * toggled — including programmatic `.click()` calls that happen inside (or
 * shortly after) a user gesture. We keep one hidden switch mounted in the DOM
 * and click it to produce physical feedback.
 *
 * On Android / desktop Chrome we fall back to `navigator.vibrate`.
 */

let switchEl: HTMLInputElement | null = null;

function ensureSwitch(): HTMLInputElement {
  if (switchEl && document.body.contains(switchEl)) return switchEl;
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.cssText =
    "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;top:-100px;left:-100px;";
  const input = document.createElement("input");
  input.type = "checkbox";
  // Non-standard WebKit attribute — this is what unlocks the Taptic tick.
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  label.appendChild(input);
  document.body.appendChild(label);
  switchEl = input;
  return input;
}

function tick() {
  try {
    ensureSwitch().click();
  } catch {
    /* haptics are decorative — never let them break a flow */
  }
}

export type HapticPattern = "light" | "medium" | "heavy" | "pulse" | "success";

const patterns: Record<HapticPattern, number[]> = {
  light: [0],
  medium: [0, 80],
  heavy: [0, 70, 140],
  // The partner's heartbeat: two strong beats, like "lub-dub".
  pulse: [0, 90, 350, 440],
  success: [0, 60, 120, 180],
};

const vibratePatterns: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 60,
  pulse: [60, 90, 60, 200, 60, 90, 60],
  success: [20, 40, 20, 40, 20],
};

export function haptic(pattern: HapticPattern = "light") {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    // Android / desktop path. Returns false when blocked (iOS) — harmless.
    const ok = navigator.vibrate(vibratePatterns[pattern]);
    if (ok) return;
  }
  // iOS path: schedule a burst of switch clicks shaping the pattern.
  for (const delay of patterns[pattern]) {
    if (delay === 0) tick();
    else window.setTimeout(tick, delay);
  }
}

/**
 * The iOS Haptic Engine.
 *
 * Safari on iOS blocks `navigator.vibrate`, but since iOS 17.4 WebKit fires
 * a real Taptic Engine tick whenever an `<input type="checkbox" switch>` is
 * toggled — including programmatic `.click()` calls made during (or shortly
 * after) a trusted user gesture. The most reliable recipe in practice is a
 * FRESH input per tick: create → click → remove. Persistent hidden inputs
 * have proven flaky across iOS point releases.
 *
 * Requirements on the device: iOS 17.4+, and Settings → Sounds & Haptics →
 * System Haptics enabled. On Android / desktop Chrome we use
 * `navigator.vibrate` instead.
 */

function tick() {
  try {
    const input = document.createElement("input");
    input.type = "checkbox";
    // Non-standard WebKit attribute — this is what unlocks the Taptic tick.
    input.setAttribute("switch", "");
    input.style.cssText =
      "position:fixed;bottom:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;";
    document.body.appendChild(input);
    input.click();
    window.setTimeout(() => input.remove(), 60);
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
  // iOS path: a burst of switch toggles shaping the pattern.
  for (const delay of patterns[pattern]) {
    if (delay === 0) tick();
    else window.setTimeout(tick, delay);
  }
}

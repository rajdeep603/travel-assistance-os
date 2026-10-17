/** localStorage key for presentation mode (read before first paint by the root layout). */
export const PRESENT_STORAGE_KEY = "taap-presentation-mode";

/** Fired on window when presentation mode changes, so every toggle stays in step. */
export const PRESENT_EVENT = "taap:present-mode";

/** Turns presentation mode on or off (client only) and remembers it. */
export function setPresentMode(on: boolean): void {
  if (on) document.documentElement.dataset.present = "on";
  else delete document.documentElement.dataset.present;
  try {
    localStorage.setItem(PRESENT_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // non-critical
  }
  window.dispatchEvent(new CustomEvent(PRESENT_EVENT, { detail: on }));
}

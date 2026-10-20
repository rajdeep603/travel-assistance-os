/** localStorage key for the docked sidebar (read before first paint by the root layout). */
export const SIDEBAR_STORAGE_KEY = "taap-sidebar";

/** Fired on window when the docked sidebar is hidden or shown, so every control stays in step. */
export const SIDEBAR_EVENT = "taap:sidebar";

/** Fired on window to toggle the sidebar from elsewhere (the command palette). */
export const SIDEBAR_TOGGLE_EVENT = "taap:sidebar-toggle";

/**
 * Screens at least this wide (an iPad in landscape, laptops) dock the sidebar
 * beside the page; narrower ones (an iPad in portrait, phones) open it as a drawer.
 * Keep in step with Tailwind's `lg` breakpoint.
 */
export const SIDEBAR_DOCK_QUERY = "(min-width: 1024px)";

/** Whether the docked sidebar is hidden (client only). */
export function isSidebarHidden(): boolean {
  return document.documentElement.dataset.sidebar === "hidden";
}

/** Hides or shows the docked sidebar (client only) and remembers it. */
export function setSidebarHidden(hidden: boolean): void {
  if (hidden) document.documentElement.dataset.sidebar = "hidden";
  else delete document.documentElement.dataset.sidebar;
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, hidden ? "hidden" : "shown");
  } catch {
    // non-critical
  }
  window.dispatchEvent(new CustomEvent(SIDEBAR_EVENT, { detail: hidden }));
}

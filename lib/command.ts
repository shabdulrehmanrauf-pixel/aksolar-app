/** The search / voice box is opened from several places (top bar, Home, Ctrl+K). They all use this event. */
export const COMMAND_EVENT = "ak:command";

export function openCommand(options: { listen?: boolean } = {}) {
  window.dispatchEvent(new CustomEvent(COMMAND_EVENT, { detail: { listen: !!options.listen } }));
}

/** A short buzz on phones that support it (a no-op elsewhere). Used for confirmations such as a pick or a purchase. */
export function buzz(ms = 15): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(ms);
  } catch {
    // Some browsers throw when vibrate is called without a recent tap. Feedback is optional.
  }
}

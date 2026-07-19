"use client";

import { useState } from "react";

export function QRToggleButton() {
  const [showing, setShowing] = useState(false);

  function toggle() {
    const el = document.getElementById("qr-desktop");
    if (el) {
      el.classList.toggle("hidden");
      setShowing(!showing);
    }
  }

  return (
    <button
      onClick={toggle}
      className="hidden md:inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200 transition-colors"
    >
      {showing ? "Hide" : "Show"} QR
    </button>
  );
}

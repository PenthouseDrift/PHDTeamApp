import { NoPinchZoom } from "@/components/NoPinchZoom";
import { gameViewport } from "@/lib/viewport";

// The game can't be pinch-zoomed on a phone. This covers the game wherever it is served, including inside the full app.
export const viewport = gameViewport;

export default function CardsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NoPinchZoom />
      {children}
    </>
  );
}

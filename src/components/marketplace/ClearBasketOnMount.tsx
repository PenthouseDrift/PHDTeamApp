"use client";

import { useEffect } from "react";
import { useBasket } from "@/components/marketplace/BasketProvider";

/**
 * Clears the client basket once, on mount. Rendered on the purchase success
 * page after a confirmed payment so the basket empties when the buyer returns
 * from the hosted SumUp checkout. Renders nothing.
 */
export function ClearBasketOnMount() {
  const { clear } = useBasket();
  useEffect(() => {
    clear();
  }, [clear]);
  return null;
}

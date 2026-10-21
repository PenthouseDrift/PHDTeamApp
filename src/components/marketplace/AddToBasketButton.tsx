"use client";

import { useState } from "react";
import { useBasket } from "@/components/marketplace/BasketProvider";

interface AddToBasketButtonProps {
  listingId: string;
  variantId?: string;
  label: string;
  unitPrice: number;
  image?: string;
  /** Max buyable units (stock minus sold minus holds). */
  maxQuantity: number;
  variant?: "full" | "compact";
  className?: string;
}

/**
 * Adds a single marketplace line to the client basket. Shows a brief "Added"
 * confirmation. Stock/price are re-validated server-side at checkout, so this
 * only needs the display snapshot.
 */
export function AddToBasketButton({
  listingId,
  variantId,
  label,
  unitPrice,
  image,
  maxQuantity,
  variant = "full",
  className,
}: AddToBasketButtonProps) {
  const { add, has } = useBasket();
  const [justAdded, setJustAdded] = useState(false);
  const inBasket = has(listingId, variantId);

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    add({ listingId, variantId, label, unitPrice, image, maxQuantity });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  };

  const cartIcon = (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
      />
    </svg>
  );

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={justAdded ? "Added to basket" : "Add to basket"}
        title={justAdded ? "Added to basket" : "Add to basket"}
        className={
          className ??
          "inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-300 bg-white/90 text-zinc-600 shadow-sm transition-colors hover:bg-amber-50 hover:text-amber-600 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-300"
        }
      >
        {justAdded ? (
          <svg className="h-4 w-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : (
          cartIcon
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className ??
        "inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500 px-4 py-3 text-sm font-bold text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
      }
    >
      {justAdded ? "✓ Added to basket" : inBasket ? "Add another" : (
        <>
          {cartIcon}
          Add to basket
        </>
      )}
    </button>
  );
}

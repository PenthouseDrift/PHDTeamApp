"use client";

import { useState, useTransition, useMemo } from "react";
import type { ShopProduct } from "@/actions/shop";
import { processShopCheckout } from "@/actions/shop-checkout";
import type { OrderItem } from "@/actions/orders";
import Image from "next/image";

interface ShopClientProps {
  products: ShopProduct[];
  userId: string;
}

export function ShopClient({ products, userId }: ShopClientProps) {
  const [cart, setCart] = useState<{ product: ShopProduct; quantity: number }[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const totalItems = useMemo(() => cart.reduce((acc, item) => acc + item.quantity, 0), [cart]);
  const totalPrice = useMemo(() => cart.reduce((acc, item) => acc + (item.product.price * item.quantity), 0), [cart]);

  function addToCart(product: ShopProduct) {
    setCart((prev) => {
      const existing = prev.find((p) => p.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev; // Cannot exceed stock
        return prev.map((p) => (p.product.id === product.id ? { ...p, quantity: p.quantity + 1 } : p));
      }
      if (product.stock <= 0) return prev;
      return [...prev, { product, quantity: 1 }];
    });
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((p) => p.product.id !== productId));
  }

  function updateQuantity(productId: string, delta: number) {
    setCart((prev) => {
      return prev.map((p) => {
        if (p.product.id === productId) {
          const newQ = p.quantity + delta;
          if (newQ <= 0) return { ...p, quantity: 0 }; // handled by filter below
          if (newQ > p.product.stock) return p;
          return { ...p, quantity: newQ };
        }
        return p;
      }).filter((p) => p.quantity > 0);
    });
  }

  function handleCheckout() {
    if (cart.length === 0 || isPending) return;
    setError(null);

    const orderItems: OrderItem[] = cart.map((item) => ({
      productId: item.product.id,
      name: item.product.name,
      price: item.product.price,
      quantity: item.quantity,
    }));

    startTransition(async () => {
      const returnUrl = `${window.location.origin}/shop/success`;
      const res = await processShopCheckout(orderItems, totalPrice, returnUrl);
      if (res.success) {
        window.location.href = res.data.checkoutUrl;
      } else {
        setError(res.error || "Failed to process checkout");
      }
    });
  }

  return (
    <div>
      <div className="flex justify-end mb-6">
        <button
          onClick={() => setIsCartOpen(!isCartOpen)}
          className="relative bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:scale-105 active:scale-95 transition-all"
        >
          <span>🛒</span>
          <span>Cart</span>
          {totalItems > 0 && (
            <span className="absolute -top-2 -right-2 bg-amber-500 text-black w-5 h-5 rounded-full text-xs flex items-center justify-center">
              {totalItems}
            </span>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-4 rounded-xl mb-6 font-medium text-sm">
          {error}
        </div>
      )}

      {isCartOpen && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-5 mb-8 animate-in slide-in-from-top-4 fade-in duration-200">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
            <span>🛒</span> Your Cart
          </h2>
          
          {cart.length === 0 ? (
            <p className="text-zinc-500 text-sm py-4 text-center">Your cart is empty.</p>
          ) : (
            <div className="space-y-4">
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {cart.map((item) => (
                  <div key={item.product.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">{item.product.name}</p>
                      <p className="text-zinc-500 text-xs font-medium">£{item.product.price.toFixed(2)} each</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg overflow-hidden">
                        <button onClick={() => updateQuantity(item.product.id, -1)} className="px-2 py-1 text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-700 font-bold">-</button>
                        <span className="w-8 text-center text-xs font-bold">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.product.id, 1)} className="px-2 py-1 text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-700 font-bold">+</button>
                      </div>
                      <p className="font-bold text-sm min-w-[60px] text-right">£{(item.product.price * item.quantity).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Total</p>
                  <p className="text-xl font-black text-zinc-900 dark:text-white">£{totalPrice.toFixed(2)}</p>
                </div>
                <button
                  onClick={handleCheckout}
                  disabled={isPending}
                  className="bg-emerald-500 hover:bg-emerald-600 text-black px-6 py-2.5 rounded-xl font-black shadow-lg shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isPending ? "Processing..." : "Checkout via SumUp"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {products.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <p className="text-zinc-500 font-medium">No products available at the moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {products.map((product) => {
            const cartItem = cart.find((c) => c.product.id === product.id);
            const qtyInCart = cartItem?.quantity || 0;
            const isOutOfStock = product.stock <= 0;
            const canAddMore = qtyInCart < product.stock;

            return (
              <div key={product.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm flex flex-col group">
                <div className="relative aspect-[4/3] bg-zinc-100 dark:bg-zinc-800 w-full overflow-hidden">
                  {product.imageUrl ? (
                    <Image src={product.imageUrl} alt={product.name} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-4xl">🛍️</span>
                    </div>
                  )}
                  {isOutOfStock && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
                      <span className="bg-red-500 text-white font-black px-3 py-1 rounded-lg uppercase tracking-wider text-sm transform -rotate-12">Out of Stock</span>
                    </div>
                  )}
                </div>
                
                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-tight">{product.name}</h3>
                    <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-lg text-sm font-black shrink-0">£{product.price.toFixed(2)}</span>
                  </div>
                  
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-3 mb-4 flex-1">
                    {product.description}
                  </p>
                  
                  <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/60 mt-auto flex items-center justify-between">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${product.stock > 5 ? 'text-emerald-500' : product.stock > 0 ? 'text-amber-500' : 'text-red-500'}`}>
                      {product.stock} in stock
                    </span>
                    
                    <button
                      onClick={() => addToCart(product)}
                      disabled={isOutOfStock || !canAddMore}
                      className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                    >
                      {qtyInCart > 0 ? `Add More (${qtyInCart})` : "Add to Cart"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { rarityLabel } from "@/lib/card-roll";
import type { FullArtCardData } from "@/lib/full-art-card";
import {
  deleteCustomPackAction,
  saveCustomPackAction,
  setCustomPackStatusAction,
  updateCustomPackPricingAction,
  updatePCreditBundlesAction,
  updateStandardPackPriceAction,
} from "@/tcg/actions";
import { P_CREDIT_BUNDLES, getEffectivePrice, getSaleDiscountPct, isOnSale } from "@/tcg/config";
import type { PCreditBundle, TcgCustomPackWithCards, TcgPackStatus } from "@/tcg/types";

const panel =
  "space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
const inputCls =
  "w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
const labelCls =
  "mb-1 block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-300 px-3.5 text-xs font-bold text-zinc-800 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800";

export function TcgPackManagerAdmin({
  savedFullArtCards,
  initialStandardPackPrice,
  initialStandardPackSalePrice = null,
  initialPCreditBundles = P_CREDIT_BUNDLES,
  initialCustomPacks,
}: {
  savedFullArtCards: FullArtCardData[];
  initialStandardPackPrice: number;
  initialStandardPackSalePrice?: number | null;
  initialPCreditBundles?: PCreditBundle[];
  initialCustomPacks: TcgCustomPackWithCards[];
}) {
  // Standard Pack Pricing State
  const [standardPrice, setStandardPrice] = useState(String(initialStandardPackPrice));
  const [standardSalePrice, setStandardSalePrice] = useState(
    initialStandardPackSalePrice ? String(initialStandardPackSalePrice) : ""
  );

  // P-Credit Bundles State
  const [bundles, setBundles] = useState<PCreditBundle[]>(initialPCreditBundles);

  // Custom Set Packs State
  const [packs, setPacks] = useState<TcgCustomPackWithCards[]>(initialCustomPacks);
  // Inline quick-sale inputs per custom pack ID
  const [quickPrices, setQuickPrices] = useState<Record<string, { price: string; salePrice: string }>>(() => {
    const init: Record<string, { price: string; salePrice: string }> = {};
    for (const p of initialCustomPacks) {
      init[p.id] = {
        price: String(p.price),
        salePrice: p.salePrice ? String(p.salePrice) : "",
      };
    }
    return init;
  });

  // Pack Editor Form State
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [packName, setPackName] = useState("");
  const [packDescription, setPackDescription] = useState("");
  const [packPrice, setPackPrice] = useState("150");
  const [packSalePrice, setPackSalePrice] = useState("");
  const [packStatus, setPackStatus] = useState<TcgPackStatus>("draft");
  const [cardsPerPack, setCardsPerPack] = useState("1");
  // Map of cardId -> weight (1-100) for cards included in the current pack's set list
  const [selectedWeights, setSelectedWeights] = useState<Record<string, number>>({});

  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const usableCards = useMemo(
    () => savedFullArtCards.filter((c): c is FullArtCardData & { id: string } => Boolean(c.id && c.imageUrl)),
    [savedFullArtCards]
  );

  const totalSelectedWeight = useMemo(
    () => Object.values(selectedWeights).reduce((sum, w) => sum + (Number(w) || 0), 0),
    [selectedWeights]
  );

  const parsedStdReg = Number(standardPrice) || 0;
  const parsedStdSale = standardSalePrice.trim() ? Number(standardSalePrice) : null;
  const stdIsOnSale = isOnSale(parsedStdReg, parsedStdSale);
  const stdDiscountPct = getSaleDiscountPct(parsedStdReg, parsedStdSale);

  const parsedPackReg = Number(packPrice) || 0;
  const parsedPackSale = packSalePrice.trim() ? Number(packSalePrice) : null;
  const editorPackOnSale = isOnSale(parsedPackReg, parsedPackSale);
  const editorPackDiscountPct = getSaleDiscountPct(parsedPackReg, parsedPackSale);

  function resetEditor() {
    setEditingId(undefined);
    setPackName("");
    setPackDescription("");
    setPackPrice("150");
    setPackSalePrice("");
    setPackStatus("draft");
    setCardsPerPack("1");
    setSelectedWeights({});
  }

  function loadPackIntoEditor(pack: TcgCustomPackWithCards) {
    setEditingId(pack.id);
    setPackName(pack.name);
    setPackDescription(pack.description);
    setPackPrice(String(pack.price));
    setPackSalePrice(pack.salePrice ? String(pack.salePrice) : "");
    setPackStatus(pack.status);
    setCardsPerPack(String(pack.cardsPerPack || 1));
    const weights: Record<string, number> = {};
    for (const c of pack.cards) {
      weights[c.cardId] = c.weight;
    }
    setSelectedWeights(weights);
    setMessage(null);
  }

  function toggleCardInSet(cardId: string) {
    setSelectedWeights((prev) => {
      const next = { ...prev };
      if (next[cardId] !== undefined) {
        delete next[cardId];
      } else {
        next[cardId] = 10;
      }
      return next;
    });
  }

  function updateCardWeight(cardId: string, weight: number) {
    const clamped = Math.max(1, Math.min(100, Math.round(Number(weight) || 1)));
    setSelectedWeights((prev) => ({ ...prev, [cardId]: clamped }));
  }

  function handleSaveStandardPrice(clearSale = false) {
    setMessage(null);
    const nextSale = clearSale || !standardSalePrice.trim() ? null : Number(standardSalePrice);
    startTransition(async () => {
      const res = await updateStandardPackPriceAction(Number(standardPrice), nextSale);
      if (res.success) {
        setStandardPrice(String(res.data.standardPackPrice));
        setStandardSalePrice(
          res.data.standardPackSalePrice ? String(res.data.standardPackSalePrice) : ""
        );
        setMessage({
          text: res.data.standardPackSalePrice
            ? `Standard Pack is now ON SALE for ${res.data.standardPackSalePrice.toLocaleString()} P-Credits (regular ${res.data.standardPackPrice.toLocaleString()} P).`
            : `Standard Pack price updated to ${res.data.standardPackPrice.toLocaleString()} P-Credits.`,
        });
      } else {
        setMessage({ text: res.error, error: true });
      }
    });
  }

  function updateBundleField(
    id: string,
    field: "name" | "pCredits" | "priceGbp" | "salePriceGbp",
    value: string
  ) {
    setBundles((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        if (field === "name") return { ...b, name: value };
        if (field === "pCredits") return { ...b, pCredits: Math.max(1, Math.round(Number(value) || 0)) };
        if (field === "priceGbp") return { ...b, priceGbp: Number(value) || 0 };
        if (field === "salePriceGbp") {
          const trimmed = value.trim();
          return { ...b, salePriceGbp: trimmed === "" ? null : Number(trimmed) };
        }
        return b;
      })
    );
  }

  function handleSaveBundles() {
    setMessage(null);
    startTransition(async () => {
      const res = await updatePCreditBundlesAction(bundles);
      if (res.success) {
        setBundles(res.data.pCreditBundles);
        setMessage({
          text: "P-Credits bundle prices and sale offers updated!",
        });
      } else {
        setMessage({ text: res.error, error: true });
      }
    });
  }

  function handleSaveCustomPack(overrideStatus?: TcgPackStatus) {
    setMessage(null);
    const statusToSave = overrideStatus ?? packStatus;
    const cardsArray = Object.entries(selectedWeights).map(([cardId, weight]) => ({
      cardId,
      weight,
    }));
    const saleVal = packSalePrice.trim() ? Number(packSalePrice) : null;

    startTransition(async () => {
      const res = await saveCustomPackAction({
        id: editingId,
        name: packName,
        description: packDescription,
        price: Number(packPrice),
        salePrice: saleVal,
        status: statusToSave,
        cardsPerPack: Number(cardsPerPack),
        cards: cardsArray,
      });
      if (res.success) {
        setPacks((prev) => [res.data, ...prev.filter((p) => p.id !== res.data.id)]);
        setQuickPrices((prev) => ({
          ...prev,
          [res.data.id]: {
            price: String(res.data.price),
            salePrice: res.data.salePrice ? String(res.data.salePrice) : "",
          },
        }));
        loadPackIntoEditor(res.data);
        setMessage({
          text: `Saved "${res.data.name}" (${res.data.status.toUpperCase()} · ${
            res.data.salePrice
              ? `ON SALE ${res.data.salePrice.toLocaleString()} P (was ${res.data.price.toLocaleString()} P)`
              : `${res.data.price.toLocaleString()} P-Credits`
          } · ${res.data.setList.length} cards in set).`,
        });
      } else {
        setMessage({ text: res.error, error: true });
      }
    });
  }

  function handleQuickPackPricingSave(pack: TcgCustomPackWithCards, clearSale = false) {
    setMessage(null);
    const entry = quickPrices[pack.id] ?? {
      price: String(pack.price),
      salePrice: pack.salePrice ? String(pack.salePrice) : "",
    };
    const nextPrice = Number(entry.price) || pack.price;
    const nextSale = clearSale || !entry.salePrice.trim() ? null : Number(entry.salePrice);

    startTransition(async () => {
      const res = await updateCustomPackPricingAction(pack.id, nextPrice, nextSale);
      if (res.success) {
        setPacks((prev) => prev.map((p) => (p.id === res.data.id ? res.data : p)));
        setQuickPrices((prev) => ({
          ...prev,
          [res.data.id]: {
            price: String(res.data.price),
            salePrice: res.data.salePrice ? String(res.data.salePrice) : "",
          },
        }));
        if (editingId === res.data.id) {
          setPackPrice(String(res.data.price));
          setPackSalePrice(res.data.salePrice ? String(res.data.salePrice) : "");
        }
        setMessage({
          text: res.data.salePrice
            ? `"${res.data.name}" is now ON SALE for ${res.data.salePrice.toLocaleString()} P-Credits!`
            : `Updated pricing for "${res.data.name}" (${res.data.price.toLocaleString()} P-Credits).`,
        });
      } else {
        setMessage({ text: res.error, error: true });
      }
    });
  }

  function handleQuickStatusToggle(pack: TcgCustomPackWithCards) {
    setMessage(null);
    const nextStatus: TcgPackStatus = pack.status === "live" ? "draft" : "live";
    startTransition(async () => {
      const res = await setCustomPackStatusAction(pack.id, nextStatus);
      if (res.success) {
        setPacks((prev) => prev.map((p) => (p.id === res.data.id ? res.data : p)));
        if (editingId === res.data.id) setPackStatus(res.data.status);
        setMessage({
          text: `"${res.data.name}" is now ${res.data.status === "live" ? "LIVE in the Pack Store" : "set to DRAFT"}.`,
        });
      } else {
        setMessage({ text: res.error, error: true });
      }
    });
  }

  function handleDeletePack(pack: TcgCustomPackWithCards) {
    setMessage(null);
    startTransition(async () => {
      const res = await deleteCustomPackAction(pack.id);
      if (res.success) {
        setPacks((prev) => prev.filter((p) => p.id !== pack.id));
        if (editingId === pack.id) resetEditor();
        setMessage({ text: `Deleted custom pack "${pack.name}".` });
      } else {
        setMessage({ text: res.error, error: true });
      }
    });
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          role="status"
          className={`rounded-2xl border p-4 text-sm font-bold ${
            message.error
              ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 1. P-Credits Bundle Pricing & Sale Prices (£ GBP) */}
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100">
              P-Credits Bundles &amp; Sale Prices (£ GBP)
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Edit the P-Credits amount, regular £ price, and optional Sale £ price for each bundle in the P-Credits Shop.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSaveBundles}
            disabled={pending}
            className={primaryBtn}
          >
            {pending ? "Saving…" : "Save P-Credit Prices"}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {bundles.map((b) => {
            const onSale = isOnSale(b.priceGbp, b.salePriceGbp);
            const discountPct = getSaleDiscountPct(b.priceGbp, b.salePriceGbp);
            return (
              <div
                key={b.id}
                className={`space-y-3 rounded-2xl border p-4 ${
                  onSale
                    ? "border-rose-500/50 bg-rose-500/5"
                    : "border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-950"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={b.name}
                    onChange={(e) => updateBundleField(b.id, "name", e.target.value)}
                    aria-label="Bundle name"
                    className="w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-sm font-black text-zinc-900 focus:border-amber-500 focus:bg-white focus:outline-none dark:text-zinc-100 dark:focus:bg-zinc-900"
                  />
                  {onSale && (
                    <span className="shrink-0 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                      -{discountPct}% Sale
                    </span>
                  )}
                </div>

                <div>
                  <label className={labelCls}>P-Credits Awarded</label>
                  <input
                    type="number"
                    min={10}
                    max={1000000}
                    step={10}
                    value={b.pCredits}
                    onChange={(e) => updateBundleField(b.id, "pCredits", e.target.value)}
                    className={inputCls}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Regular (£)</label>
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={b.priceGbp}
                      onChange={(e) => updateBundleField(b.id, "priceGbp", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Sale (£)</label>
                    <input
                      type="number"
                      min={0.5}
                      step={0.25}
                      placeholder="No sale"
                      value={b.salePriceGbp ?? ""}
                      onChange={(e) => updateBundleField(b.id, "salePriceGbp", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>

                {onSale && (
                  <div className="flex items-center justify-between pt-1 text-[11px]">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      Live: <span className="line-through opacity-60">£{b.priceGbp.toFixed(2)}</span> £
                      {getEffectivePrice(b.priceGbp, b.salePriceGbp).toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateBundleField(b.id, "salePriceGbp", "")}
                      className="font-bold text-rose-500 hover:underline"
                    >
                      Clear sale
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Standard Pack Price & Sale Price Config */}
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100">
                Standard Pack Price &amp; Sale Price
              </h2>
              {stdIsOnSale && (
                <span className="rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-2.5 py-0.5 text-[10px] font-black uppercase text-white shadow">
                  🔥 On Sale · {stdDiscountPct}% Off
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Set the regular P-Credit price (default 100) and an optional Sale Price to put the Standard Pack on sale in the Pack Store.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-36">
              <label htmlFor="std-reg-price" className={labelCls}>
                Regular (P-Credits)
              </label>
              <input
                id="std-reg-price"
                type="number"
                min={1}
                max={100000}
                step={5}
                value={standardPrice}
                onChange={(e) => setStandardPrice(e.target.value)}
                className={`${inputCls} font-bold`}
              />
            </div>

            <div className="w-36">
              <label htmlFor="std-sale-price" className={labelCls}>
                Sale Price (Optional)
              </label>
              <input
                id="std-sale-price"
                type="number"
                min={1}
                max={100000}
                step={5}
                placeholder="Off"
                value={standardSalePrice}
                onChange={(e) => setStandardSalePrice(e.target.value)}
                className={`${inputCls} font-bold`}
              />
            </div>

            <button
              type="button"
              onClick={() => handleSaveStandardPrice(false)}
              disabled={pending}
              className={primaryBtn}
            >
              Save Pack Price
            </button>

            {standardSalePrice.trim() !== "" && (
              <button
                type="button"
                onClick={() => handleSaveStandardPrice(true)}
                disabled={pending}
                className={secondaryBtn}
              >
                End Sale
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 3. Existing Custom Packs List with Inline Sale Controls */}
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100">
              Custom Set Packs ({packs.length})
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Create custom named packs from your saved Full-Art cards, set regular &amp; sale P-Credit prices, and toggle them between Draft and Live.
            </p>
          </div>
          <button type="button" onClick={resetEditor} className={secondaryBtn}>
            + New Custom Pack
          </button>
        </div>

        {packs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            No custom packs created yet. Use the builder below to create your first custom set pack!
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {packs.map((pack) => {
              const isEditing = editingId === pack.id;
              const packOnSale = isOnSale(pack.price, pack.salePrice);
              const effectivePrice = getEffectivePrice(pack.price, pack.salePrice);
              const discountPct = getSaleDiscountPct(pack.price, pack.salePrice);
              const qp = quickPrices[pack.id] ?? {
                price: String(pack.price),
                salePrice: pack.salePrice ? String(pack.salePrice) : "",
              };
              const previewCards = pack.setList.slice(0, 3).map((s) => s.card);

              return (
                <div
                  key={pack.id}
                  className={`flex flex-col justify-between rounded-2xl border p-4 transition-colors ${
                    isEditing
                      ? "border-amber-500 bg-amber-500/5"
                      : packOnSale
                        ? "border-rose-500/50 bg-rose-500/5"
                        : "border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-950"
                  }`}
                >
                  <div className="space-y-3">
                    {/* Mini Pack Preview Banner with On Sale Badge */}
                    {previewCards.length > 0 && (
                      <div
                        className={`relative flex h-36 items-center justify-center overflow-hidden rounded-xl p-3 ${
                          packOnSale
                            ? "bg-gradient-to-b from-rose-950/80 via-zinc-900 to-zinc-950"
                            : "bg-gradient-to-b from-zinc-900 to-zinc-950"
                        }`}
                      >
                        <div className="flex items-center justify-center -space-x-6">
                          {previewCards.map((c, idx) => (
                            <div
                              key={c.id ?? idx}
                              className="w-20"
                              style={{
                                transform:
                                  previewCards.length > 1
                                    ? `rotate(${(idx - (previewCards.length - 1) / 2) * 8}deg)`
                                    : undefined,
                                zIndex: idx === 1 ? 10 : idx,
                              }}
                            >
                              <FullArtCard card={c} className="drop-shadow-lg" />
                            </div>
                          ))}
                        </div>
                        {packOnSale && (
                          <span className="absolute right-2.5 top-2.5 rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-2.5 py-0.5 text-[10px] font-black uppercase text-white shadow">
                            🔥 On Sale · -{discountPct}%
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                              pack.status === "live"
                                ? "bg-emerald-500 text-black"
                                : "bg-zinc-300 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200"
                            }`}
                          >
                            {pack.status}
                          </span>
                          <h3 className="text-base font-black text-zinc-900 dark:text-zinc-100">
                            {pack.name}
                          </h3>
                        </div>
                        {pack.description && (
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            {pack.description}
                          </p>
                        )}
                      </div>

                      {packOnSale ? (
                        <div className="shrink-0 text-right">
                          <span className="mr-1.5 text-xs font-bold text-zinc-400 line-through">
                            {pack.price.toLocaleString()} P
                          </span>
                          <span className="rounded-xl bg-emerald-500/15 px-2.5 py-1 text-xs font-black text-emerald-600 dark:text-emerald-400">
                            {effectivePrice.toLocaleString()} P-Credits
                          </span>
                        </div>
                      ) : (
                        <span className="shrink-0 rounded-xl bg-amber-500/15 px-2.5 py-1 text-xs font-black text-amber-600 dark:text-amber-400">
                          {pack.price.toLocaleString()} P-Credits
                        </span>
                      )}
                    </div>

                    <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                      {pack.setList.length} card{pack.setList.length === 1 ? "" : "s"} in set list ·{" "}
                      {pack.cardsPerPack} pulled per pack
                    </p>

                    {/* Quick Inline Price & Sale Price Bar */}
                    <div className="rounded-xl border border-zinc-200/80 bg-white/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/80">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-zinc-400">
                            Regular (P)
                          </label>
                          <input
                            type="number"
                            min={1}
                            step={5}
                            value={qp.price}
                            onChange={(e) =>
                              setQuickPrices((prev) => ({
                                ...prev,
                                [pack.id]: { ...qp, price: e.target.value },
                              }))
                            }
                            className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-rose-500">
                            Sale Price (P)
                          </label>
                          <input
                            type="number"
                            min={1}
                            step={5}
                            placeholder="No sale"
                            value={qp.salePrice}
                            onChange={(e) =>
                              setQuickPrices((prev) => ({
                                ...prev,
                                [pack.id]: { ...qp, salePrice: e.target.value },
                              }))
                            }
                            className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          />
                        </div>
                        <div className="col-span-2 flex items-end gap-1.5 sm:col-span-1">
                          <button
                            type="button"
                            onClick={() => handleQuickPackPricingSave(pack, false)}
                            disabled={pending}
                            className="min-h-8 flex-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-black text-black hover:bg-amber-400 disabled:opacity-50"
                          >
                            Update
                          </button>
                          {packOnSale && (
                            <button
                              type="button"
                              onClick={() => handleQuickPackPricingSave(pack, true)}
                              disabled={pending}
                              className="min-h-8 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-[11px] font-bold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                              End Sale
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-200/70 pt-3 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => loadPackIntoEditor(pack)}
                      className={secondaryBtn}
                    >
                      {isEditing ? "Editing…" : "Edit Pack & Set List"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickStatusToggle(pack)}
                      disabled={pending}
                      className={`min-h-10 rounded-xl px-3.5 text-xs font-black transition-colors ${
                        pack.status === "live"
                          ? "border border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-300"
                          : "bg-emerald-500 text-black hover:bg-emerald-400"
                      }`}
                    >
                      {pack.status === "live" ? "Switch to Draft" : "Publish Live"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePack(pack)}
                      disabled={pending}
                      className="ml-auto min-h-10 rounded-xl border border-red-500/30 px-3 text-xs font-bold text-red-600 hover:bg-red-500/10 dark:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Custom Pack Builder & Set List Assigner */}
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">
                {editingId ? `Editing Pack: ${packName || "Untitled"}` : "Create New Custom Set Pack"}
              </h2>
              {editorPackOnSale && (
                <span className="rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-2.5 py-0.5 text-[10px] font-black uppercase text-white">
                  🔥 Sale -{editorPackDiscountPct}%
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Name your pack, set its regular &amp; optional sale P-Credit price, and select which saved Full-Art cards belong to its Set List.
            </p>
          </div>
          {editingId && (
            <button type="button" onClick={resetEditor} className={secondaryBtn}>
              Cancel Edit (Create New)
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2">
            <label htmlFor="pack-name" className={labelCls}>
              Pack Name
            </label>
            <input
              id="pack-name"
              type="text"
              maxLength={60}
              value={packName}
              onChange={(e) => setPackName(e.target.value)}
              placeholder="e.g. Night Runners Vol. 1"
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="pack-price" className={labelCls}>
              Regular Price (P)
            </label>
            <input
              id="pack-price"
              type="number"
              min={1}
              max={100000}
              step={5}
              value={packPrice}
              onChange={(e) => setPackPrice(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="pack-sale-price" className={labelCls}>
              Sale Price (Optional)
            </label>
            <input
              id="pack-sale-price"
              type="number"
              min={1}
              max={100000}
              step={5}
              placeholder="No sale"
              value={packSalePrice}
              onChange={(e) => setPackSalePrice(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="pack-status" className={labelCls}>
              Status &amp; Cards / Pack
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                id="pack-status"
                value={packStatus}
                onChange={(e) => setPackStatus(e.target.value as TcgPackStatus)}
                className={inputCls}
              >
                <option value="draft">Draft</option>
                <option value="live">Live</option>
              </select>
              <select
                aria-label="Cards per pack"
                value={cardsPerPack}
                onChange={(e) => setCardsPerPack(e.target.value)}
                className={inputCls}
              >
                <option value="1">1 Card</option>
                <option value="2">2 Cards</option>
                <option value="3">3 Cards</option>
              </select>
            </div>
          </div>

          <div className="sm:col-span-2 lg:col-span-5">
            <label htmlFor="pack-desc" className={labelCls}>
              Pack Description (Optional)
            </label>
            <input
              id="pack-desc"
              type="text"
              maxLength={200}
              value={packDescription}
              onChange={(e) => setPackDescription(e.target.value)}
              placeholder="Describe the theme or special cards inside this set pack…"
              className={inputCls}
            />
          </div>
        </div>

        {/* Set List Selector */}
        <div className="space-y-3 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                Assign Set List Cards ({Object.keys(selectedWeights).length} selected)
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Click any saved Full-Art card below to include it in this pack&apos;s set list. Adjust the weight (1–100) to control pull odds.
              </p>
            </div>
          </div>

          {usableCards.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              No saved Full-Art cards found. Save some cards in the &ldquo;Full art card&rdquo; tab first, then assign them to a pack here!
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {usableCards.map((c) => {
                const weight = selectedWeights[c.id];
                const isSelected = weight !== undefined;
                const chancePct =
                  isSelected && totalSelectedWeight > 0
                    ? Math.round((weight / totalSelectedWeight) * 1000) / 10
                    : 0;
                return (
                  <li
                    key={c.id}
                    className={`flex flex-col justify-between rounded-2xl border-2 p-2.5 transition-all ${
                      isSelected
                        ? "border-amber-500 bg-amber-500/10 shadow-sm"
                        : "border-zinc-200 bg-white opacity-80 hover:opacity-100 dark:border-zinc-800 dark:bg-zinc-950"
                    }`}
                  >
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => toggleCardInSet(c.id)}
                        className="relative block w-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                      >
                        <FullArtCard card={c} className="drop-shadow" />
                        <span
                          className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black shadow ${
                            isSelected
                              ? "bg-amber-500 text-black"
                              : "bg-black/70 text-zinc-200"
                          }`}
                        >
                          {isSelected ? "✓ In Set" : "+ Add"}
                        </span>
                      </button>
                      <div className="px-1">
                        <p className="truncate text-xs font-black text-zinc-900 dark:text-zinc-100">
                          {c.name}
                        </p>
                        <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                          {rarityLabel(c.tier)}
                        </p>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="mt-2 space-y-1 border-t border-amber-500/30 pt-2">
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <label htmlFor={`weight-${c.id}`} className="text-zinc-700 dark:text-zinc-300">
                            Weight
                          </label>
                          <span className="text-amber-600 dark:text-amber-400">{chancePct}% pull</span>
                        </div>
                        <input
                          id={`weight-${c.id}`}
                          type="number"
                          min={1}
                          max={100}
                          value={weight}
                          onChange={(e) => updateCardWeight(c.id, Number(e.target.value))}
                          className="w-full rounded-lg border border-amber-500/50 bg-white px-2 py-1 text-xs font-bold text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => handleSaveCustomPack("draft")}
            disabled={pending}
            className={secondaryBtn}
          >
            {pending ? "Saving…" : editingId ? "Save as Draft" : "Create as Draft"}
          </button>
          <button
            type="button"
            onClick={() => handleSaveCustomPack("live")}
            disabled={pending}
            className={primaryBtn}
          >
            {pending ? "Saving…" : editingId ? "Save & Publish Live" : "Create & Publish Live"}
          </button>
        </div>
      </section>
    </div>
  );
}

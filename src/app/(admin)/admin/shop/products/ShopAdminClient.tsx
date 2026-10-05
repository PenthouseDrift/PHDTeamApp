"use client";

import { useState, useTransition } from "react";
import type { ShopProduct } from "@/actions/shop";
import { createProduct, updateProduct, deleteProduct } from "@/actions/shop";
import Image from "next/image";

interface ShopAdminClientProps {
  initialProducts: ShopProduct[];
}

export function ShopAdminClient({ initialProducts }: ShopAdminClientProps) {
  const [products, setProducts] = useState(initialProducts);
  const [isPending, startTransition] = useTransition();

  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<Partial<ShopProduct>>({});
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setIsEditing(null);
    setIsCreating(false);
    setFormData({});
    setError(null);
  }

  function handleEdit(product: ShopProduct) {
    setIsEditing(product.id);
    setFormData(product);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    setError(null);

    const { name, description, price, stock, imageUrl, isActive } = formData;
    if (!name || price === undefined || stock === undefined) {
      setError("Name, price, and stock are required");
      return;
    }

    startTransition(async () => {
      let res;
      if (isCreating) {
        res = await createProduct({
          name,
          description: description || "",
          price: Number(price),
          stock: Number(stock),
          imageUrl,
          isActive: isActive !== undefined ? isActive : true,
        });
      } else if (isEditing) {
        res = await updateProduct(isEditing, {
          name,
          description,
          price: Number(price),
          stock: Number(stock),
          imageUrl,
          isActive,
        });
      }

      if (res?.success) {
        if (isCreating) {
          setProducts([res.data, ...products]);
        } else {
          setProducts(products.map((p) => (p.id === res.data.id ? res.data : p)));
        }
        resetForm();
      } else {
        setError(res?.error || "Failed to save product");
      }
    });
  }

  async function handleDelete(id: string) {
    if (isPending || !confirm("Are you sure you want to delete this product?")) return;

    startTransition(async () => {
      const res = await deleteProduct(id);
      if (res.success) {
        setProducts(products.filter((p) => p.id !== id));
      }
    });
  }

  async function toggleActive(id: string, current: boolean) {
    if (isPending) return;
    startTransition(async () => {
      const res = await updateProduct(id, { isActive: !current });
      if (res.success && res.data) {
        setProducts(products.map((p) => (p.id === id ? res.data! : p)));
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => {
            resetForm();
            setIsCreating(true);
            setFormData({ isActive: true, price: 0, stock: 0 });
          }}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold shadow-xs transition-colors"
        >
          + Add Product
        </button>
      </div>

      {(isCreating || isEditing) && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
          <h2 className="text-lg font-bold mb-4">{isCreating ? "Add New Product" : "Edit Product"}</h2>
          {error && <p className="text-red-500 text-sm font-medium mb-4">{error}</p>}
          
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Product Name</label>
                <input
                  type="text"
                  required
                  value={formData.name || ""}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. DRIFT Hoodie"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Image URL</label>
                <input
                  type="url"
                  value={formData.imageUrl || ""}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm"
                  placeholder="https://..."
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Price (£)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0"
                  value={formData.price || 0}
                  onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Stock Available</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={formData.stock || 0}
                  onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Description</label>
              <textarea
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm h-24 resize-none"
                placeholder="Product details..."
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500"
              />
              <label htmlFor="isActive" className="text-sm font-medium">Active (Visible in Store)</label>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={resetForm}
                disabled={isPending}
                className="px-4 py-2 rounded-lg font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-black px-6 py-2 rounded-lg font-bold disabled:opacity-50"
              >
                {isPending ? "Saving..." : "Save Product"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Product List */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className="px-4 py-3 font-semibold text-zinc-500 uppercase tracking-wider text-xs">Product</th>
              <th className="px-4 py-3 font-semibold text-zinc-500 uppercase tracking-wider text-xs">Price</th>
              <th className="px-4 py-3 font-semibold text-zinc-500 uppercase tracking-wider text-xs">Stock</th>
              <th className="px-4 py-3 font-semibold text-zinc-500 uppercase tracking-wider text-xs">Status</th>
              <th className="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {products.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  No products found. Create one to start selling!
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {product.imageUrl ? (
                        <div className="relative w-10 h-10 rounded border border-zinc-200 overflow-hidden bg-zinc-100 shrink-0">
                          <Image src={product.imageUrl} alt={product.name} fill className="object-cover" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded border border-zinc-200 bg-zinc-100 flex items-center justify-center shrink-0">
                          <span className="text-zinc-400 text-xs">No img</span>
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-zinc-900 dark:text-zinc-100">{product.name}</p>
                        <p className="text-[11px] text-zinc-500 w-48 truncate">{product.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium">£{product.price.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      product.stock > 10 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' 
                      : product.stock > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                    }`}>
                      {product.stock} left
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(product.id, product.isActive)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                        product.isActive ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                      }`}
                    >
                      <span className="sr-only">Use setting</span>
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute left-0 inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out ${
                          product.isActive ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(product)}
                        className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-2 py-1"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="text-xs font-medium text-red-500 hover:text-red-700 px-2 py-1"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

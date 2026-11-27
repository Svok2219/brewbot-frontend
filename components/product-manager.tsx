"use client"

import Image from "next/image"
import { useState, type FormEvent } from "react"
import useSWR from "swr"
import { Archive, Check, Pencil, Plus, RotateCcw, X } from "lucide-react"
import { BEVERAGE_STOCK_LIMIT } from "@/lib/inventory"

type Product = {
  id: string
  name: string
  description: string
  pricePaisa: number
  image: string
  stock: number
  isActive: boolean
  sortOrder: number
}

type ProductResponse = { products: Product[] }
type ProductDraft = Omit<Product, "id">

const blankDraft: ProductDraft = {
  name: "",
  description: "",
  pricePaisa: 0,
  image: "/coffee-cup.png",
  stock: BEVERAGE_STOCK_LIMIT,
  isActive: true,
  sortOrder: 100,
}

async function fetchProducts(url: string): Promise<ProductResponse> {
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) throw new Error("Products could not be loaded.")
  return response.json() as Promise<ProductResponse>
}

export function ProductManager({ deviceId }: { deviceId: string }) {
  const productsUrl = `/api/admin/products?deviceId=${encodeURIComponent(deviceId)}`
  const productUrl = (productId: string) => `/api/admin/products/${encodeURIComponent(productId)}?deviceId=${encodeURIComponent(deviceId)}`
  const { data, error, isLoading, mutate } = useSWR<ProductResponse>(productsUrl, fetchProducts, {
    refreshInterval: 10000,
    revalidateOnFocus: true,
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ProductDraft | null>(null)
  const [price, setPrice] = useState("")
  const [feedback, setFeedback] = useState("")
  const [busy, setBusy] = useState(false)
  const [archiveId, setArchiveId] = useState<string | null>(null)
  const products = data?.products ?? []

  function editProduct(product?: Product) {
    setEditingId(product?.id ?? null)
    setDraft(product ? {
      name: product.name,
      description: product.description,
      pricePaisa: product.pricePaisa,
      image: product.image,
      stock: product.stock,
      isActive: product.isActive,
      sortOrder: product.sortOrder,
    } : { ...blankDraft, sortOrder: (products.length + 1) * 10 })
    setPrice(product ? (product.pricePaisa / 100).toFixed(2) : "")
    setFeedback("")
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || busy) return
    setBusy(true)
    setFeedback("")

    const payload = { ...draft, pricePaisa: Math.round(Number(price) * 100) }
    try {
      const response = await fetch(editingId ? productUrl(editingId) : "/api/admin/products", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, deviceId }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? "Product could not be saved.")
      await mutate()
      setDraft(null)
      setEditingId(null)
      setFeedback(editingId ? "Product updated. The storefront will refresh shortly." : "Product added to the storefront.")
    } catch (saveError) {
      setFeedback(saveError instanceof Error ? saveError.message : "Product could not be saved.")
    } finally {
      setBusy(false)
    }
  }

  async function refillProduct(product: Product) {
    if (busy || product.stock >= BEVERAGE_STOCK_LIMIT) return
    setBusy(true)
    setFeedback("")
    try {
      const response = await fetch(productUrl(product.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          name: product.name,
          description: product.description,
          image: product.image,
          pricePaisa: product.pricePaisa,
          stock: BEVERAGE_STOCK_LIMIT,
          sortOrder: product.sortOrder,
          isActive: product.isActive,
        }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? "Stock could not be refilled.")
      await mutate()
      setFeedback(`${product.name} stock refilled to ${BEVERAGE_STOCK_LIMIT} cups.`)
    } catch (refillError) {
      setFeedback(refillError instanceof Error ? refillError.message : "Stock could not be refilled.")
    } finally {
      setBusy(false)
    }
  }

  async function archiveProduct(product: Product) {
    setBusy(true)
    setFeedback("")
    try {
      const response = await fetch(productUrl(product.id), { method: "DELETE" })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? "Product could not be archived.")
      setArchiveId(null)
      await mutate()
      setFeedback(`${product.name} is no longer available on the storefront.`)
    } catch (archiveError) {
      setFeedback(archiveError instanceof Error ? archiveError.message : "Product could not be archived.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="ops-card ops-products-card" aria-labelledby="products-heading">
      <div className="ops-card-heading">
        <div>
          <p className="ops-eyebrow">LIVE MENU</p>
          <h2 id="products-heading">Products</h2>
          <p>This device’s catalog. Stock is capped at {BEVERAGE_STOCK_LIMIT} cups; changes do not affect other devices.</p>
        </div>
        {!draft && <button className="ops-button-primary" type="button" onClick={() => editProduct()}><Plus aria-hidden="true" /> Add product</button>}
      </div>

      {feedback && <p className="ops-feedback" role="status">{feedback}</p>}
      {error && <p className="ops-error" role="alert">{error.message}</p>}
      {isLoading && <p className="ops-empty">Loading the live catalog…</p>}

      {draft && (
        <form className="ops-product-form" onSubmit={saveProduct}>
          <div className="ops-product-form-heading">
            <strong>{editingId ? "Edit product" : "New product"}</strong>
            <button type="button" className="ops-icon-action" aria-label="Cancel editing" onClick={() => { setDraft(null); setEditingId(null) }}><X aria-hidden="true" /></button>
          </div>
          <label>Product name<input value={draft.name} maxLength={120} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
          <label>Description<textarea rows={2} maxLength={1000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <div className="ops-product-form-row">
            <label>Price (Tk)<input type="number" min="0.01" max="1000000" step="0.01" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} required /></label>
            <label>Stock (cups, max {BEVERAGE_STOCK_LIMIT})<input type="number" min="0" max={BEVERAGE_STOCK_LIMIT} step="1" value={draft.stock} onChange={(event) => setDraft({ ...draft, stock: Number(event.target.value) })} required /></label>
          </div>
          <label>Image URL or site path<input type="text" maxLength={2048} placeholder="/coffee-cup.png or https://…" value={draft.image} onChange={(event) => setDraft({ ...draft, image: event.target.value })} /></label>
          <label>Display order<input type="number" min="0" max="100000" step="1" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })} required /></label>
          <label className="ops-product-active"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} /> Available on storefront</label>
          <div className="ops-edit-actions">
            <button className="ops-button-primary" type="submit" disabled={busy}><Check aria-hidden="true" /> {busy ? "Saving…" : "Save product"}</button>
            <button className="ops-button-quiet" type="button" onClick={() => { setDraft(null); setEditingId(null) }}>Cancel</button>
          </div>
        </form>
      )}

      {!isLoading && !error && products.length === 0 && <p className="ops-empty">No products are in the catalog yet. Add one to show it on the storefront.</p>}
      <div className="ops-product-list">
        {products.map((product) => (
          <article className={`ops-product-row${product.isActive ? "" : " is-archived"}`} key={product.id}>
            <Image src={product.image || "/coffee-cup.png"} alt={`${product.name} product`} width={52} height={52} unoptimized />
            <div className="ops-product-copy">
              <strong>{product.name}</strong>
              <span>{product.isActive ? `Stock: ${product.stock}/${BEVERAGE_STOCK_LIMIT} cups` : "Archived · hidden from storefront"}</span>
            </div>
            <strong className="ops-product-price">Tk {(product.pricePaisa / 100).toFixed(2)}</strong>
            {archiveId === product.id ? (
              <div className="ops-archive-confirm" role="group" aria-label={`Archive ${product.name}`}>
                <button className="ops-cancel-confirm-button" type="button" disabled={busy} onClick={() => archiveProduct(product)}>Archive</button>
                <button className="ops-icon-action" type="button" aria-label="Keep product" onClick={() => setArchiveId(null)}><X aria-hidden="true" /></button>
              </div>
            ) : (
              <div className="ops-product-actions">
                <button className="ops-icon-action" type="button" aria-label={`Edit ${product.name}`} onClick={() => editProduct(product)}><Pencil aria-hidden="true" /> Edit</button>
                {product.isActive && product.stock < BEVERAGE_STOCK_LIMIT && (
                  <button className="ops-icon-action" type="button" aria-label={`Refill ${product.name} to ${BEVERAGE_STOCK_LIMIT} cups`} disabled={busy} onClick={() => refillProduct(product)}>
                    <RotateCcw aria-hidden="true" /> Refill to {BEVERAGE_STOCK_LIMIT}
                  </button>
                )}
                {product.isActive
                  ? <button className="ops-icon-action ops-archive-action" type="button" aria-label={`Archive ${product.name}`} onClick={() => setArchiveId(product.id)}><Archive aria-hidden="true" /></button>
                  : <button className="ops-icon-action" type="button" aria-label={`Restore ${product.name}`} onClick={() => editProduct({ ...product, isActive: true })}><RotateCcw aria-hidden="true" /></button>}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

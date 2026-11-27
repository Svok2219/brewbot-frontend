"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowRight, WalletCards } from "lucide-react"

type Props = {
  productId: string
  deviceId: string | null
  pricePaisa: number
}

export function WalletPaymentButton({ productId, deviceId, pricePaisa }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [needsSignIn, setNeedsSignIn] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)

  async function pay() {
    if (busy || !deviceId) return
    setBusy(true)
    setError("")
    setNeedsSignIn(false)
    const requestKey = idempotencyKey ?? crypto.randomUUID()
    setIdempotencyKey(requestKey)
    try {
      const response = await fetch("/api/payments/wallet/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, deviceId, idempotencyKey: requestKey }),
      })
      const payload = await response.json() as { resultToken?: string; error?: string }
      if (response.status === 401) {
        setNeedsSignIn(true)
        throw new Error(payload.error ?? "Sign in before using your wallet.")
      }
      if (!response.ok || !payload.resultToken) throw new Error(payload.error ?? "Wallet payment could not be completed.")
      window.location.assign(`/checkout/result?ref=${encodeURIComponent(payload.resultToken)}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet payment could not be completed.")
      setBusy(false)
    }
  }

  return (
    <div className="wallet-payment-action">
      <button className="wallet-payment-button" type="button" onClick={pay} disabled={busy || !deviceId} aria-busy={busy}>
        <span className="wallet-payment-icon"><WalletCards size={20} aria-hidden="true" /></span>
        <span className="wallet-payment-copy">
          <strong>{busy ? "Processing payment…" : "Pay with wallet"}</strong>
          <small>{busy ? "Please wait" : "Use your BrewBot balance"}</small>
        </span>
        <span className="wallet-payment-price">
          ৳{(pricePaisa / 100).toFixed(2)} <ArrowRight size={16} aria-hidden="true" />
        </span>
      </button>
      {error && (
        <p className="checkout-message" role="alert">
          {error}
          {(needsSignIn || error.toLowerCase().includes("balance")) && deviceId && (
            <> <Link href={`/account?deviceId=${encodeURIComponent(deviceId)}`}>{needsSignIn ? "Sign in" : "Add balance"}</Link></>
          )}
        </p>
      )}
    </div>
  )
}

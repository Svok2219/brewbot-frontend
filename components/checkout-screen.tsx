"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Clock3, Phone, WalletCards } from "lucide-react"
import { CheckoutPaymentButton } from "@/components/eps-checkout-form"
import { WalletPaymentButton } from "@/components/wallet-payment-button"
import type { BrewbotProduct } from "@/lib/products"

type CheckoutScreenProps = {
  product: BrewbotProduct | null
  requestedDeviceId?: string
  maintainerName?: string | null
  maintainerContact?: string | null
}

export function CheckoutScreen({ product, requestedDeviceId, maintainerName, maintainerContact }: CheckoutScreenProps) {
  const router = useRouter()
  const validDeviceId = requestedDeviceId && /^[A-Z0-9_-]{1,64}$/.test(requestedDeviceId)
    ? requestedDeviceId
    : null
  const deviceHomePath = validDeviceId ? `/${encodeURIComponent(validDeviceId)}` : "/"
  const maintainerPhoneHref = maintainerContact?.replace(/[^\d+]/g, "")
  const [seconds, setSeconds] = useState(45)
  const [rfidOpen, setRfidOpen] = useState(false)

  useEffect(() => {
    if (seconds <= 0) {
      router.replace(deviceHomePath)
      return
    }

    const timerId = window.setTimeout(() => setSeconds((remaining) => remaining - 1), 1000)
    return () => window.clearTimeout(timerId)
  }, [seconds, router, deviceHomePath])

  if (!product) {
    return <main className="checkout-compact-page"><p className="checkout-data-message" role="status">This product is no longer available.</p><Link className="kiosk-checkout-link" href={deviceHomePath}>Back to menu</Link></main>
  }

  return (
    <main className="checkout-compact-page">
      <header className="checkout-compact-header">
        <Link href={deviceHomePath} aria-label="Back to products"><ArrowLeft size={19} /></Link>
        <h1>Checkout</h1>
        <span className="checkout-countdown" role="timer" aria-label={`${seconds} seconds remaining`}>
          <Clock3 size={15} aria-hidden="true" /> {seconds}s
        </span>
      </header>
      <div className="checkout-compact-content">
        <section className="checkout-product-card" aria-label="Selected drink">
          <Image src={product.image || "/coffee-cup.png"} alt={product.name} width={76} height={76} unoptimized />
          <div className="checkout-product-copy">
            <h2>{product.name}</h2>
            <p>{(product.pricePaisa / 100).toFixed(2)} Tk</p>
          </div>
          <strong className="checkout-product-price">
            {(product.pricePaisa / 100).toLocaleString("en-BD", { maximumFractionDigits: 2 })} Tk
          </strong>
        </section>
        <section className="checkout-total-card" aria-label="Order total">
          <strong>Total Amount</strong>
          <b>{(product.pricePaisa / 100).toLocaleString("en-BD", { maximumFractionDigits: 2 })} Tk</b>
        </section>
        <footer className="checkout-payment-actions">
          <WalletPaymentButton productId={product.id} deviceId={validDeviceId} pricePaisa={product.pricePaisa} />
          <button className="checkout-rfid-button" type="button" onClick={() => setRfidOpen(true)}>
            <WalletCards size={18} aria-hidden="true" /> Pay with RFID Card
          </button>
          <CheckoutPaymentButton productId={product.id} deviceId={validDeviceId} />
        </footer>
      </div>
      {rfidOpen && (
        <div className="kiosk-overlay" role="presentation" onClick={() => setRfidOpen(false)}>
          <section className="kiosk-modal checkout-rfid-modal" role="dialog" aria-modal="true" aria-labelledby="rfid-title" onClick={(event) => event.stopPropagation()}>
            <button className="kiosk-modal-close" type="button" onClick={() => setRfidOpen(false)} aria-label="Close">×</button>
            <WalletCards size={28} aria-hidden="true" />
            <h2 id="rfid-title">Pay with RFID Card</h2>
            <div className="rfid-instruction-highlight">
              <p><strong>Put your RFID card in front of the machine&apos;s card reader.</strong></p>
              <p>Dispensing will start within 60 seconds.</p>
            </div>
            <p className="rfid-no-card-help"><strong>No card?</strong> Contact the machine maintainer to get a free RFID subscription card using your university ID card.</p>
            <address className="checkout-rfid-contact">
              <strong>{maintainerName || "Device maintainer"}</strong>
              {maintainerContact && maintainerPhoneHref && (
                <a href={`tel:${maintainerPhoneHref}`}><Phone size={15} aria-hidden="true" /> {maintainerContact}</a>
              )}
              {(!maintainerContact || !maintainerPhoneHref) && (
                <span>No contact is listed. Please ask the campus office or device administrator.</span>
              )}
            </address>
            <button className="kiosk-checkout-link" type="button" onClick={() => setRfidOpen(false)}>Got it</button>
          </section>
        </div>
      )}
    </main>
  )
}

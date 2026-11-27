import Link from "next/link"
import { eq } from "drizzle-orm"
import { CheckoutSuccessCountdown } from "@/components/checkout-success-countdown"
import { db } from "@/lib/db"
import { devices, paymentAttempts } from "@/lib/db/schema"

const resultReferencePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const deviceIdPattern = /^[A-Z0-9_-]{1,64}$/

export default async function CheckoutResultPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[] }>
}) {
  const query = await searchParams
  const reference = typeof query.ref === "string" ? query.ref : ""
  let attempt: {
    status: "pending" | "paid" | "failed" | "cancelled"
    productName: string
    amountPaisa: number
    paymentMethod: "eps" | "wallet"
    deviceId: string | null
    universityName: string | null
    locationName: string | null
    customerOrderId: string
    epsTransactionId: string | null
    paidAt: Date | null
    updatedAt: Date
    createdAt: Date
  } | null = null
  let storageReady = true

  if (resultReferencePattern.test(reference)) {
    try {
      const [storedAttempt] = await db.select({
        status: paymentAttempts.status,
        productName: paymentAttempts.productName,
        amountPaisa: paymentAttempts.amountPaisa,
        paymentMethod: paymentAttempts.paymentMethod,
        deviceId: paymentAttempts.deviceId,
        universityName: devices.universityName,
        locationName: devices.locationName,
        customerOrderId: paymentAttempts.customerOrderId,
        epsTransactionId: paymentAttempts.epsTransactionId,
        paidAt: paymentAttempts.paidAt,
        updatedAt: paymentAttempts.updatedAt,
        createdAt: paymentAttempts.createdAt,
      })
        .from(paymentAttempts)
        .leftJoin(devices, eq(paymentAttempts.deviceId, devices.deviceId))
        .where(eq(paymentAttempts.resultToken, reference))
        .limit(1)

      attempt = storedAttempt ?? null
    } catch {
      storageReady = false
    }
  }

  const title = attempt?.status === "paid"
    ? "Payment successful"
    : attempt?.status === "pending"
      ? "Payment is being checked"
      : attempt
        ? "Payment not completed"
        : "Payment status unavailable"
  const message = attempt?.status === "paid"
    ? "Your payment is confirmed. Follow the instructions below to collect your drink."
    : attempt?.status === "pending"
      ? "Your payment is still being confirmed. Please wait before starting another payment."
      : attempt
        ? "Your payment was not completed. You can return to the menu and try again."
        : storageReady
          ? "We could not find a verified payment for this reference."
          : "Payment confirmation is temporarily unavailable. Please check again shortly."
  const homePath = attempt?.deviceId && deviceIdPattern.test(attempt.deviceId)
    ? `/${encodeURIComponent(attempt.deviceId)}`
    : "/"
  const confirmationTime = attempt?.paidAt ?? attempt?.updatedAt ?? attempt?.createdAt
  const expiresAt = attempt?.status === "paid" && confirmationTime
    ? confirmationTime.getTime() + 60_000
    : null
  const secondsRemaining = expiresAt === null
    ? 0
    : Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
  const paidAtLabel = attempt?.status === "paid" && confirmationTime
    ? new Intl.DateTimeFormat("en-BD", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Dhaka",
      }).format(confirmationTime)
    : null
  const deviceLocation = [attempt?.locationName, attempt?.universityName].filter(Boolean).join(", ")

  return (
    <main className="checkout-result-page">
      <section className={`checkout-result-card checkout-result-${attempt?.status ?? "unknown"}`} aria-labelledby="checkout-result-title">
        <p className="checkout-result-eyebrow">BrewBot checkout</p>
        <h1 id="checkout-result-title">{title}</h1>
        <p className="checkout-result-message">{message}</p>
        {attempt && (
          <dl className="checkout-result-details">
            <div><dt>Product</dt><dd>{attempt.productName}</dd></div>
            <div><dt>Total paid</dt><dd>{(attempt.amountPaisa / 100).toFixed(2)} Tk</dd></div>
            <div><dt>Device</dt><dd>{attempt.deviceId ?? "Not specified"}</dd></div>
            {deviceLocation && <div><dt>Location</dt><dd>{deviceLocation}</dd></div>}
            {paidAtLabel && <div><dt>Paid at</dt><dd>{paidAtLabel}</dd></div>}
            <div><dt>Payment method</dt><dd>{attempt.paymentMethod === "wallet" ? "BrewBot wallet" : "EPS"}</dd></div>
            <div><dt>Payment reference</dt><dd>{attempt.epsTransactionId ?? attempt.customerOrderId}</dd></div>
          </dl>
        )}
        {attempt?.status === "paid" && (
          <section className="checkout-result-access" aria-labelledby="checkout-result-access-title">
            <p className="checkout-result-access-eyebrow">Dispensing instructions</p>
            <h2 id="checkout-result-access-title">Place your cup on the dispensing tray</h2>
            <p className="checkout-result-access-copy">Dispensing should begin within 15 seconds. Your purchase includes a 60-second dispensing window from payment confirmation.</p>
            {expiresAt !== null && (
              <CheckoutSuccessCountdown
                expiresAt={expiresAt}
                initialSeconds={secondsRemaining}
                homePath={homePath}
              />
            )}
          </section>
        )}
        {!storageReady && <p className="checkout-result-note">Payment storage setup is still pending.</p>}
        <Link className="checkout-result-link" href={homePath}>
          {attempt?.status === "paid" ? "Return to menu now" : "Return to menu"}
        </Link>
      </section>
    </main>
  )
}

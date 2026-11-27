import { randomInt, randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { rfidWalletTopups } from "@/lib/db/schema"
import { getPublicRequestOrigin, isSameOriginRequest } from "@/lib/request-origin"
import { EPSConfigurationError, initializeEPSPayment } from "@/lib/payments/eps"
import { getWalletAccount } from "@/lib/wallet-auth"

export const runtime = "nodejs"

function createMerchantTransactionId() {
  return `${Date.now()}${randomInt(0, 1_000_000_000).toString().padStart(9, "0")}`
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 })
  const body: unknown = await request.json().catch(() => null)
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Choose a valid wallet top-up amount." }, { status: 400 })
  }
  const input = body as Record<string, unknown>
  const amountPaisa = input.amountPaisa
  const idempotencyKey = input.idempotencyKey
  if (
    typeof amountPaisa !== "number" || !Number.isSafeInteger(amountPaisa) ||
    ![10_000, 20_000, 50_000, 100_000].includes(amountPaisa) ||
    typeof idempotencyKey !== "string" || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)
  ) {
    return NextResponse.json({ error: "Choose a valid wallet top-up amount." }, { status: 400 })
  }

  try {
    const account = await getWalletAccount()
    if (!account) return NextResponse.json({ error: "Sign in before adding wallet balance." }, { status: 401 })

    const [existing] = await db.select({
      redirectUrl: rfidWalletTopups.redirectUrl,
      walletAccountId: rfidWalletTopups.walletAccountId,
      amountPaisa: rfidWalletTopups.amountPaisa,
    }).from(rfidWalletTopups).where(eq(rfidWalletTopups.idempotencyKey, idempotencyKey)).limit(1)
    if (existing && (existing.walletAccountId !== account.id || existing.amountPaisa !== amountPaisa)) {
      return NextResponse.json({ error: "This payment reference was already used for different details." }, { status: 409 })
    }
    if (existing?.redirectUrl) return NextResponse.json({ redirectUrl: existing.redirectUrl })
    if (existing) return NextResponse.json({ error: "This top-up is already being prepared. Try again shortly." }, { status: 409 })

    const merchantTransactionId = createMerchantTransactionId()
    const customerOrderId = `BREW-WALLET-${randomUUID()}`
    const resultToken = randomUUID()
    await db.insert(rfidWalletTopups).values({
      merchantTransactionId,
      customerOrderId,
      resultToken,
      rfidUserId: null,
      walletAccountId: account.id,
      deviceId: null,
      userName: account.userName,
      amountPaisa,
      idempotencyKey,
      status: "pending",
    })

    try {
      const callback = new URL("/api/payments/eps/wallet-return", getPublicRequestOrigin(request))
      const successUrl = new URL(callback)
      successUrl.searchParams.set("callbackOutcome", "success")
      const failUrl = new URL(callback)
      failUrl.searchParams.set("callbackOutcome", "failure")
      const cancelUrl = new URL(callback)
      cancelUrl.searchParams.set("callbackOutcome", "cancel")
      const redirectUrl = await initializeEPSPayment({
        customerOrderId,
        merchantTransactionId,
        totalAmountPaisa: amountPaisa,
        successUrl: successUrl.toString(),
        failUrl: failUrl.toString(),
        cancelUrl: cancelUrl.toString(),
        customerName: account.userName,
        customerEmail: "",
        customerPhone: "",
        customerAddress: "",
        customerCity: "",
        customerState: "",
        customerPostcode: "",
        productName: "BrewBot Universal Wallet Top-up",
      })
      await db.update(rfidWalletTopups).set({ redirectUrl, updatedAt: new Date() })
        .where(and(
          eq(rfidWalletTopups.merchantTransactionId, merchantTransactionId),
          eq(rfidWalletTopups.walletAccountId, account.id),
        ))
      return NextResponse.json({ redirectUrl })
    } catch (error) {
      await db.update(rfidWalletTopups).set({ status: "failed", updatedAt: new Date() })
        .where(eq(rfidWalletTopups.merchantTransactionId, merchantTransactionId))
        .catch((updateError) => console.error("[wallet top-up] Failed to mark initialization failure:", updateError))
      const configError = error instanceof EPSConfigurationError
      console.error("[wallet top-up] EPS initialization failed:", error)
      return NextResponse.json({
        error: configError
          ? "Online payments are not configured yet. Please contact the administrator."
          : "The payment gateway could not be opened. Please try again.",
      }, { status: configError ? 503 : 502 })
    }
  } catch (error) {
    console.error("[wallet top-up] Unable to create top-up:", error)
    return NextResponse.json({ error: "Wallet top-up is temporarily unavailable." }, { status: 503 })
  }
}

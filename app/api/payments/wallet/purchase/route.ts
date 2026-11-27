import { randomUUID } from "node:crypto"
import { and, eq, gt, sql } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { devices, paymentAttempts, products, walletAccounts, walletTransactions } from "@/lib/db/schema"
import { isSameOriginRequest } from "@/lib/request-origin"
import { getWalletAccount } from "@/lib/wallet-auth"

export const runtime = "nodejs"

type PurchaseOutcome =
  | { kind: "paid"; resultToken: string }
  | { kind: "missing-account" }
  | { kind: "missing-product" }
  | { kind: "out-of-stock" }
  | { kind: "insufficient-balance" }

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z0-9_-]{1,64}$/.test(value)
}

function validProductId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 160
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 })
  const body: unknown = await request.json().catch(() => null)
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "This wallet payment could not be started." }, { status: 400 })
  }
  const input = body as Record<string, unknown>
  const deviceId = input.deviceId
  const productId = input.productId
  const idempotencyKey = input.idempotencyKey
  if (!validId(deviceId) || !validProductId(productId) ||
      typeof idempotencyKey !== "string" || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
    return NextResponse.json({ error: "This wallet payment could not be started." }, { status: 400 })
  }

  try {
    const account = await getWalletAccount()
    if (!account) return NextResponse.json({ error: "Sign in to pay with your wallet." }, { status: 401 })

    const outcome = await db.transaction<PurchaseOutcome>(async (tx) => {
      const [lockedAccount] = await tx.select({
        id: walletAccounts.id,
        walletBalancePaisa: walletAccounts.walletBalancePaisa,
      }).from(walletAccounts).where(eq(walletAccounts.id, account.id)).for("update")
      if (!lockedAccount) return { kind: "missing-account" }

      const [existingAttempt] = await tx.select({
        resultToken: paymentAttempts.resultToken,
      }).from(paymentAttempts).where(and(
        eq(paymentAttempts.walletAccountId, account.id),
        eq(paymentAttempts.walletIdempotencyKey, idempotencyKey),
      )).limit(1)
      if (existingAttempt) return { kind: "paid", resultToken: existingAttempt.resultToken }

      const [activeDevice] = await tx.select({ deviceId: devices.deviceId }).from(devices)
        .where(and(eq(devices.deviceId, deviceId), eq(devices.isActive, true))).limit(1)
      if (!activeDevice) return { kind: "missing-product" }

      const [product] = await tx.select({
        id: products.id,
        deviceId: products.deviceId,
        name: products.name,
        pricePaisa: products.pricePaisa,
        stock: products.stock,
      }).from(products).where(and(
        eq(products.id, productId),
        eq(products.deviceId, deviceId),
        eq(products.isActive, true),
      )).for("update")
      if (!product) return { kind: "missing-product" }
      if (product.stock <= 0) return { kind: "out-of-stock" }
      if (lockedAccount.walletBalancePaisa < product.pricePaisa) return { kind: "insufficient-balance" }

      const balanceAfter = lockedAccount.walletBalancePaisa - product.pricePaisa
      const orderId = randomUUID()
      const resultToken = randomUUID()
      await tx.insert(paymentAttempts).values({
        merchantTransactionId: `WALLET-${orderId}`,
        customerOrderId: `BREW-WALLET-${orderId}`,
        resultToken,
        productId: product.id,
        productName: product.name,
        deviceId,
        amountPaisa: product.pricePaisa,
        status: "paid",
        paymentMethod: "wallet",
        walletAccountId: account.id,
        walletIdempotencyKey: idempotencyKey,
        paidAt: new Date(),
      })
      await tx.update(walletAccounts).set({
        walletBalancePaisa: balanceAfter,
        updatedAt: new Date(),
      }).where(and(
        eq(walletAccounts.id, account.id),
        gt(walletAccounts.walletBalancePaisa, product.pricePaisa - 1),
      ))
      await tx.update(products).set({ stock: sql`${products.stock} - 1`, updatedAt: new Date() })
        .where(and(eq(products.id, product.id), gt(products.stock, 0)))
      await tx.insert(walletTransactions).values({
        accountId: account.id,
        type: "purchase",
        amountPaisa: -product.pricePaisa,
        balanceAfterPaisa: balanceAfter,
        reference: `purchase:${idempotencyKey}`,
      })
      return { kind: "paid", resultToken }
    })

    if (outcome.kind === "paid") return NextResponse.json({ resultToken: outcome.resultToken })
    if (outcome.kind === "missing-account") return NextResponse.json({ error: "Your wallet account is unavailable." }, { status: 404 })
    if (outcome.kind === "missing-product") return NextResponse.json({ error: "This product is no longer available at this device." }, { status: 404 })
    if (outcome.kind === "out-of-stock") return NextResponse.json({ error: "This product is out of stock." }, { status: 409 })
    return NextResponse.json({ error: "Your wallet balance is too low. Add balance and try again." }, { status: 409 })
  } catch (error) {
    console.error("[wallet purchase] Could not complete purchase:", error)
    return NextResponse.json({ error: "Wallet payment is temporarily unavailable." }, { status: 503 })
  }
}

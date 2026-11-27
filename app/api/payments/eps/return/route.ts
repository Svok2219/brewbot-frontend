import { and, eq, gt, ne, sql } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { paymentAttempts, products } from "@/lib/db/schema"
import { verifyEPSTransaction } from "@/lib/payments/eps"

export const runtime = "nodejs"

function resultRedirect(request: NextRequest, resultToken?: string) {
  const url = new URL("/checkout/result", request.url)
  if (resultToken) url.searchParams.set("ref", resultToken)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams
  const merchantTransactionId = search.get("merchantTransactionId") ?? search.get("MerchantTransactionId")

  if (!merchantTransactionId || !/^\d{10,30}$/.test(merchantTransactionId)) {
    return resultRedirect(request)
  }

  try {
    const [attempt] = await db.select().from(paymentAttempts)
      .where(eq(paymentAttempts.merchantTransactionId, merchantTransactionId))
      .limit(1)

    if (!attempt) return resultRedirect(request)
    if (attempt.status === "paid") return resultRedirect(request, attempt.resultToken)

    let verification
    try {
      verification = await verifyEPSTransaction(merchantTransactionId)
    } catch {
      return resultRedirect(request, attempt.resultToken)
    }

    const idMatches = verification.merchantTransactionId === merchantTransactionId
    const amountMatches = verification.amountPaisa === attempt.amountPaisa
    const verifiedStatus = idMatches && amountMatches && verification.status === "success"
      ? "paid"
      : verification.status === "pending"
        ? "pending"
        : verification.status === "cancelled" || verification.status === "canceled"
          ? "cancelled"
          : "failed"

    if (verifiedStatus === "paid") {
      const paidAt = new Date()
      await db.transaction(async (tx) => {
        const [settledAttempt] = await tx.update(paymentAttempts)
          .set({
            status: "paid",
            epsTransactionId: verification.epsTransactionId,
            updatedAt: paidAt,
            paidAt,
          })
          .where(and(
            eq(paymentAttempts.merchantTransactionId, merchantTransactionId),
            ne(paymentAttempts.status, "paid"),
          ))
          .returning({ productId: paymentAttempts.productId, deviceId: paymentAttempts.deviceId })

        if (!settledAttempt) return

        await tx.update(products)
          .set({ stock: sql`GREATEST(${products.stock} - 1, 0)` })
          .where(and(
            eq(products.id, settledAttempt.productId),
            ...(settledAttempt.deviceId ? [eq(products.deviceId, settledAttempt.deviceId)] : []),
            gt(products.stock, 0),
          ))
      })
    } else {
      await db.update(paymentAttempts)
        .set({
          status: verifiedStatus,
          epsTransactionId: verification.epsTransactionId,
          updatedAt: new Date(),
          paidAt: null,
        })
        .where(and(
          eq(paymentAttempts.merchantTransactionId, merchantTransactionId),
          ne(paymentAttempts.status, "paid"),
        ))
    }

    return resultRedirect(request, attempt.resultToken)
  } catch {
    return resultRedirect(request)
  }
}

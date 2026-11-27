import { and, eq, ne, sql } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { rfidWalletTopups, walletAccounts, walletTransactions } from "@/lib/db/schema"
import { verifyEPSTransaction } from "@/lib/payments/eps"

export const runtime = "nodejs"

function resultRedirect(request: NextRequest, resultToken?: string) {
  const url = new URL("/account", request.url)
  if (resultToken) url.searchParams.set("resultToken", resultToken)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams
  const merchantTransactionId = search.get("merchantTransactionId") ?? search.get("MerchantTransactionId")
  if (!merchantTransactionId || !/^\d{10,30}$/.test(merchantTransactionId)) return resultRedirect(request)

  try {
    const [topup] = await db.select().from(rfidWalletTopups)
      .where(eq(rfidWalletTopups.merchantTransactionId, merchantTransactionId)).limit(1)
    if (!topup) return resultRedirect(request)
    if (topup.status === "paid") return resultRedirect(request, topup.resultToken)

    const verification = await verifyEPSTransaction(merchantTransactionId).catch(() => null)
    if (!verification) return resultRedirect(request, topup.resultToken)
    const matches = verification.merchantTransactionId === merchantTransactionId &&
      verification.amountPaisa === topup.amountPaisa
    const verified = matches && verification.status === "success"

    if (verified) {
      await db.transaction(async (tx) => {
        const [settled] = await tx.update(rfidWalletTopups).set({
          status: "paid",
          epsTransactionId: verification.epsTransactionId,
          updatedAt: new Date(),
          paidAt: new Date(),
        }).where(and(
          eq(rfidWalletTopups.merchantTransactionId, merchantTransactionId),
          ne(rfidWalletTopups.status, "paid"),
        )).returning({
          walletAccountId: rfidWalletTopups.walletAccountId,
          amountPaisa: rfidWalletTopups.amountPaisa,
        })

        if (settled) {
          if (!settled.walletAccountId) throw new Error("Wallet top-up is missing its universal account.")
          const [account] = await tx.update(walletAccounts).set({
            walletBalancePaisa: sql`${walletAccounts.walletBalancePaisa} + ${settled.amountPaisa}`,
            updatedAt: new Date(),
          }).where(eq(walletAccounts.id, settled.walletAccountId))
            .returning({ walletBalancePaisa: walletAccounts.walletBalancePaisa })
          if (!account) throw new Error("Wallet account for top-up was not found.")
          await tx.insert(walletTransactions).values({
            accountId: settled.walletAccountId,
            type: "topup",
            amountPaisa: settled.amountPaisa,
            balanceAfterPaisa: account.walletBalancePaisa,
            reference: `topup:${merchantTransactionId}`,
          })
        }
      })
    } else {
      const status = !matches
        ? "failed"
        : verification.status === "cancelled" || verification.status === "canceled"
          ? "cancelled"
          : verification.status === "pending"
            ? "pending"
            : "failed"
      await db.update(rfidWalletTopups).set({
        status,
        epsTransactionId: verification.epsTransactionId,
        updatedAt: new Date(),
      }).where(and(
        eq(rfidWalletTopups.merchantTransactionId, merchantTransactionId),
        ne(rfidWalletTopups.status, "paid"),
      ))
    }

    return resultRedirect(request, topup.resultToken)
  } catch (error) {
    console.error("[wallet top-up] Return handling failed:", error)
    return resultRedirect(request)
  }
}

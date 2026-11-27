import { and, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { rfidWalletTopups, walletAccounts } from "@/lib/db/schema"
import { getWalletAccount } from "@/lib/wallet-auth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const resultToken = request.nextUrl.searchParams.get("resultToken")
  if (!resultToken || !/^[0-9a-f-]{36}$/i.test(resultToken)) {
    return NextResponse.json({ error: "Invalid top-up reference." }, { status: 400 })
  }

  try {
    const account = await getWalletAccount()
    if (!account) return NextResponse.json({ error: "Sign in to view your wallet." }, { status: 401 })
    const [topup] = await db.select({ status: rfidWalletTopups.status })
      .from(rfidWalletTopups).where(and(
        eq(rfidWalletTopups.resultToken, resultToken),
        eq(rfidWalletTopups.walletAccountId, account.id),
      )).limit(1)
    if (!topup) return NextResponse.json({ error: "Top-up not found." }, { status: 404 })

    const [currentAccount] = await db.select({ walletBalancePaisa: walletAccounts.walletBalancePaisa })
      .from(walletAccounts).where(eq(walletAccounts.id, account.id)).limit(1)
    return NextResponse.json({
      status: topup.status,
      walletBalancePaisa: currentAccount?.walletBalancePaisa ?? account.walletBalancePaisa,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[wallet top-up] Could not load result:", error)
    return NextResponse.json({ error: "Top-up status is temporarily unavailable." }, { status: 503 })
  }
}

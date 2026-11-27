import { and, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { rfidWalletTopups } from "@/lib/db/schema"
import { getWalletAccount, serializeWalletAccount } from "@/lib/wallet-auth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const account = await getWalletAccount()
  if (!account) return NextResponse.json({ error: "Sign in to view your wallet." }, { status: 401 })

  const resultToken = request.nextUrl.searchParams.get("resultToken")
  if (resultToken) {
    if (!/^[0-9a-f-]{36}$/i.test(resultToken)) {
      return NextResponse.json({ error: "Invalid payment result." }, { status: 400 })
    }
    const [topup] = await db.select({ status: rfidWalletTopups.status })
      .from(rfidWalletTopups).where(and(
        eq(rfidWalletTopups.resultToken, resultToken),
        eq(rfidWalletTopups.walletAccountId, account.id),
      )).limit(1)
    if (!topup) return NextResponse.json({ error: "Payment result not found." }, { status: 404 })
    return NextResponse.json({ status: topup.status, account: serializeWalletAccount(account) }, {
      headers: { "Cache-Control": "no-store" },
    })
  }

  const identifier = request.nextUrl.searchParams.get("identifier")?.trim()
  const normalized = identifier?.replace(/[\s:-]/g, "").toUpperCase()
  if (!identifier || identifier.length > 80) {
    return NextResponse.json({ error: "Enter a card number or user ID." }, { status: 400 })
  }
  const matchesCard = normalized === account.cardId
  const matchesStudentId = account.studentId?.toLowerCase() === identifier.toLowerCase()
  if (!matchesCard && !matchesStudentId) {
    return NextResponse.json({ error: "That identifier does not belong to your signed-in account." }, { status: 403 })
  }
  return NextResponse.json({ account: serializeWalletAccount(account) }, { headers: { "Cache-Control": "no-store" } })
}

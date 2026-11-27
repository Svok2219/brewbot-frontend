import { eq, sql } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { walletAccountDevices, walletAccounts } from "@/lib/db/schema"
import { isSameOriginRequest } from "@/lib/request-origin"
import { verifyPassword } from "@/lib/password-hash"
import { createWalletSessionToken, serializeWalletAccount, WALLET_SESSION_COOKIE, walletSessionCookieOptions } from "@/lib/wallet-auth"

const dummyPasswordHash = `scrypt$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(64).toString("base64url")}`
const cardPattern = /^(?:[A-F0-9]{2}){2,32}$/

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 })
  const body: unknown = await request.json().catch(() => null)
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Enter your student ID or card HEX and password." }, { status: 400 })
  }

  const input = body as Record<string, unknown>
  const identifier = typeof input.identifier === "string" ? input.identifier.trim() : ""
  const password = typeof input.password === "string" ? input.password : ""
  const deviceId = typeof input.deviceId === "string" && /^[A-Z0-9_-]{1,64}$/.test(input.deviceId) ? input.deviceId : null
  if (!identifier || identifier.length > 80 || password.length > 128 ||
      (input.deviceId !== undefined && !deviceId)) {
    return NextResponse.json({ error: "Enter your student ID or card HEX and password." }, { status: 400 })
  }

  try {
    const normalizedCard = identifier.replace(/[\s:-]/g, "").toUpperCase()
    const [byStudentId] = await db.select().from(walletAccounts)
      .where(sql`lower(trim(${walletAccounts.studentId})) = ${identifier.toLowerCase()}`).limit(1)
    const [byCard] = cardPattern.test(normalizedCard)
      ? await db.select().from(walletAccounts).where(eq(walletAccounts.cardId, normalizedCard)).limit(1)
      : []
    const account = byStudentId && byCard && byStudentId.id !== byCard.id ? null : byStudentId ?? byCard
    const validPassword = await verifyPassword(password, account?.passwordHash ?? dummyPasswordHash)
    if (!account || !account.passwordHash || !validPassword) {
      return NextResponse.json({ error: "The student ID/card HEX or password is incorrect." }, { status: 401 })
    }

    if (deviceId) {
      await db.insert(walletAccountDevices).values({ accountId: account.id, deviceId }).onConflictDoNothing()
    }
    const response = NextResponse.json({ account: serializeWalletAccount(account) }, { headers: { "Cache-Control": "no-store" } })
    response.cookies.set(WALLET_SESSION_COOKIE, createWalletSessionToken(account.id), walletSessionCookieOptions())
    return response
  } catch (error) {
    console.error("[wallet account] Sign-in failed:", error)
    return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 503 })
  }
}

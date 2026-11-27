import { and, eq, sql } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { devices, walletAccountDevices, walletAccounts } from "@/lib/db/schema"
import { hashPassword } from "@/lib/password-hash"
import { isSameOriginRequest } from "@/lib/request-origin"
import { createWalletSessionToken, getWalletAccount, serializeWalletAccount, WALLET_SESSION_COOKIE, walletSessionCookieOptions } from "@/lib/wallet-auth"

export const dynamic = "force-dynamic"

const cardPattern = /^(?:[A-F0-9]{2}){2,32}$/
const idPattern = /^[A-Z0-9_-]{1,64}$/

function normalizeCard(value: unknown) {
  const card = typeof value === "string" ? value.trim().replace(/[\s:-]/g, "").toUpperCase() : ""
  return cardPattern.test(card) ? card : null
}

function normalizeStudentId(value: unknown) {
  const studentId = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
  return studentId.length <= 80 ? (studentId || null) : null
}

function isDuplicateError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505"
}

export async function GET() {
  try {
    const account = await getWalletAccount()
    if (!account) return NextResponse.json({ error: "Sign in to view your account." }, { status: 401 })
    return NextResponse.json({ account: serializeWalletAccount(account) }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[wallet account] Unable to load session:", error)
    return NextResponse.json({ error: "Your account is temporarily unavailable." }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 })
  const body: unknown = await request.json().catch(() => null)
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Check your account details and try again." }, { status: 400 })
  }

  const input = body as Record<string, unknown>
  const userName = typeof input.userName === "string" ? input.userName.trim().replace(/\s+/g, " ") : ""
  const rawCardHex = typeof input.cardHex === "string" ? input.cardHex.trim() : ""
  const cardId = rawCardHex ? normalizeCard(rawCardHex) : null
  const studentId = normalizeStudentId(input.studentId)
  const password = typeof input.password === "string" ? input.password : ""
  const deviceId = typeof input.deviceId === "string" && idPattern.test(input.deviceId) ? input.deviceId : null
  if (
    userName.length < 2 || userName.length > 120 || (rawCardHex && !cardId) ||
    (input.studentId !== undefined && studentId === null && input.studentId !== "") ||
    password.length < 12 || password.length > 128 ||
    (input.deviceId !== undefined && !deviceId) ||
    (!cardId && !studentId)
  ) {
    return NextResponse.json({ error: "Enter a name, student ID or card HEX, and a password of at least 12 characters." }, { status: 400 })
  }

  const passwordHash = await hashPassword(password)
  try {
    const account = await db.transaction(async (tx) => {
      if (deviceId) {
        const [device] = await tx.select({ deviceId: devices.deviceId }).from(devices)
          .where(and(eq(devices.deviceId, deviceId), eq(devices.isActive, true))).limit(1)
        if (!device) throw new Error("The selected device is unavailable.")
      }

      const [byCard] = cardId
        ? await tx.select().from(walletAccounts).where(eq(walletAccounts.cardId, cardId)).limit(1)
        : []
      const [byStudentId] = studentId
        ? await tx.select().from(walletAccounts).where(sql`lower(trim(${walletAccounts.studentId})) = ${studentId.toLowerCase()}`).limit(1)
        : []
      if (byCard && byStudentId && byCard.id !== byStudentId.id) throw new Error("The card and student ID belong to different accounts.")

      const existing = byCard ?? byStudentId
      let savedAccount
      if (existing) {
        if (existing.passwordHash) throw new Error("This account already has a password. Please sign in.")
        if (cardId && existing.cardId !== cardId) throw new Error("The card HEX does not match this account.")
        if (existing.studentId && studentId && existing.studentId.toLowerCase() !== studentId.toLowerCase()) {
          throw new Error("The student ID does not match this account.")
        }
        ;[savedAccount] = await tx.update(walletAccounts).set({
          passwordHash,
          studentId: existing.studentId ?? studentId,
          updatedAt: new Date(),
        }).where(eq(walletAccounts.id, existing.id)).returning()
      } else {
        if (!cardId) throw new Error("Enter your card HEX to create a new account.")
        ;[savedAccount] = await tx.insert(walletAccounts).values({
          userName,
          cardId,
          studentId,
          passwordHash,
        }).returning()
      }

      if (deviceId && savedAccount) {
        await tx.insert(walletAccountDevices).values({ accountId: savedAccount.id, deviceId }).onConflictDoNothing()
      }
      return savedAccount
    })

    if (!account) throw new Error("Account could not be created.")
    const response = NextResponse.json({ account: serializeWalletAccount(account) }, { status: 201 })
    response.cookies.set(WALLET_SESSION_COOKIE, createWalletSessionToken(account.id), walletSessionCookieOptions())
    return response
  } catch (error) {
    if (isDuplicateError(error)) {
      return NextResponse.json({ error: "That student ID or card is already linked to another account." }, { status: 409 })
    }
    if (error instanceof Error && (
      error.message.includes("already has a password") ||
      error.message.includes("different accounts") ||
      error.message.includes("does not match") ||
      error.message.includes("unavailable") ||
      error.message.includes("Enter your card HEX")
    )) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error("[wallet account] Registration failed:", error)
    return NextResponse.json({ error: "Account registration is temporarily unavailable." }, { status: 503 })
  }
}

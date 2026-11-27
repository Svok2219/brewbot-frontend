import { and, asc, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getMaintainerAccess } from "@/lib/maintainer-auth"
import { db } from "@/lib/db"
import { walletAccountDevices, walletAccounts } from "@/lib/db/schema"
import { isSameOriginRequest } from "@/lib/request-origin"

export const dynamic = "force-dynamic"

function accessDenied() {
  return NextResponse.json({ error: "Maintainer access required." }, { status: 401 })
}

export async function GET() {
  try {
    const deviceId = await getMaintainerAccess()
    if (!deviceId) return accessDenied()

    const users = await db.select({
      id: walletAccounts.id,
      userName: walletAccounts.userName,
      cardId: walletAccounts.cardId,
      walletBalancePaisa: walletAccounts.walletBalancePaisa,
      createdAt: walletAccountDevices.createdAt,
    }).from(walletAccountDevices)
      .innerJoin(walletAccounts, eq(walletAccounts.id, walletAccountDevices.accountId))
      .where(eq(walletAccountDevices.deviceId, deviceId))
      .orderBy(asc(walletAccounts.userName))

    return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[maintainer RFID] Could not load linked accounts:", error)
    return NextResponse.json({ error: "RFID users could not be loaded." }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  let deviceId: string | null
  try {
    deviceId = await getMaintainerAccess()
  } catch {
    return NextResponse.json({ error: "Maintainer access could not be verified." }, { status: 503 })
  }
  if (!deviceId) return accessDenied()
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 })

  const body: unknown = await request.json().catch(() => null)
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Check the RFID details and try again." }, { status: 400 })
  }
  const input = body as Record<string, unknown>
  const userName = typeof input.userName === "string" ? input.userName.trim().replace(/\s+/g, " ") : ""
  const cardId = typeof input.cardId === "string" ? input.cardId.trim().replace(/[\s:-]/g, "").toUpperCase() : ""
  if (userName.length < 2 || userName.length > 120 || !/^(?:[A-F0-9]{2}){2,32}$/.test(cardId)) {
    return NextResponse.json({ error: "Check the user name and RFID card number." }, { status: 400 })
  }

  try {
    const [existingAccount] = await db.select().from(walletAccounts).where(eq(walletAccounts.cardId, cardId)).limit(1)
    const account = existingAccount ?? (await db.insert(walletAccounts).values({ userName, cardId })
      .onConflictDoNothing().returning())[0]
    if (!account) return NextResponse.json({ error: "That card is already being registered. Try again." }, { status: 409 })

    const [deviceLink] = await db.insert(walletAccountDevices).values({ accountId: account.id, deviceId })
      .onConflictDoNothing().returning({ accountId: walletAccountDevices.accountId })
    if (!deviceLink) {
      return NextResponse.json({ error: "That RFID card is already linked to this device." }, { status: 409 })
    }

    return NextResponse.json({
      user: {
        id: account.id,
        userName: account.userName,
        cardId: account.cardId,
        walletBalancePaisa: account.walletBalancePaisa,
      },
    }, { status: 201 })
  } catch (error) {
    console.error("[maintainer RFID] Could not link account:", error)
    return NextResponse.json({ error: "RFID user could not be registered." }, { status: 503 })
  }
}

export async function DELETE(request: NextRequest) {
  let deviceId: string | null
  try {
    deviceId = await getMaintainerAccess()
  } catch {
    return NextResponse.json({ error: "Maintainer access could not be verified." }, { status: 503 })
  }
  if (!deviceId) return accessDenied()
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 })

  const id = request.nextUrl.searchParams.get("id")
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid RFID user." }, { status: 400 })
  }

  try {
    const [unlinked] = await db.delete(walletAccountDevices).where(and(
      eq(walletAccountDevices.accountId, id),
      eq(walletAccountDevices.deviceId, deviceId),
    )).returning({ accountId: walletAccountDevices.accountId })
    if (!unlinked) return NextResponse.json({ error: "RFID account is not linked to this device." }, { status: 404 })
    return NextResponse.json({ deactivated: true })
  } catch (error) {
    console.error("[maintainer RFID] Could not unlink account:", error)
    return NextResponse.json({ error: "RFID access could not be removed." }, { status: 503 })
  }
}

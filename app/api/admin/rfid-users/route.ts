import { and, asc, eq, sql } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getMaintainerUser } from "@/lib/maintainer-auth"
import { db } from "@/lib/db"
import { devices, rfidUsers } from "@/lib/db/schema"
import { isSameOriginRequest } from "@/lib/request-origin"

export const dynamic = "force-dynamic"

function adminDenied() {
  return NextResponse.json({ error: "Maintainer access required." }, { status: 401 })
}

function validDeviceId(value: string | null): value is string {
  return Boolean(value && /^[A-Z0-9_-]{1,64}$/.test(value))
}

export async function GET(request: NextRequest) {
  try {
    if (!(await getMaintainerUser())) return adminDenied()
    const deviceId = request.nextUrl.searchParams.get("deviceId")
    if (!validDeviceId(deviceId)) return NextResponse.json({ error: "Invalid device." }, { status: 400 })

    const users = await db.select({
      id: rfidUsers.id,
      userName: rfidUsers.userName,
      cardId: rfidUsers.cardId,
      walletBalancePaisa: rfidUsers.walletBalancePaisa,
      createdAt: rfidUsers.createdAt,
    }).from(rfidUsers)
      .where(and(eq(rfidUsers.deviceId, deviceId), eq(rfidUsers.isActive, true)))
      .orderBy(asc(rfidUsers.userName))

    return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "RFID users could not be loaded." }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await getMaintainerUser())) return adminDenied()
  } catch {
    return NextResponse.json({ error: "Admin access could not be verified." }, { status: 503 })
  }
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 })

  const body: unknown = await request.json().catch(() => null)
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Check the RFID details and try again." }, { status: 400 })
  }
  const input = body as Record<string, unknown>
  const deviceId = typeof input.deviceId === "string" ? input.deviceId.trim() : ""
  const userName = typeof input.userName === "string" ? input.userName.trim().replace(/\s+/g, " ") : ""
  const cardId = typeof input.cardId === "string" ? input.cardId.trim().replace(/[\s:-]/g, "").toUpperCase() : ""
  if (!validDeviceId(deviceId) || userName.length < 2 || userName.length > 120 || !/^[A-Z0-9_-]{4,64}$/.test(cardId)) {
    return NextResponse.json({ error: "Check the user name and RFID card number." }, { status: 400 })
  }

  try {
    const [device] = await db.select({ deviceId: devices.deviceId }).from(devices)
      .where(and(eq(devices.deviceId, deviceId), eq(devices.isActive, true))).limit(1)
    if (!device) return NextResponse.json({ error: "This device is not active." }, { status: 400 })

    const [duplicateCard] = await db.select({ id: rfidUsers.id }).from(rfidUsers).where(and(
      eq(rfidUsers.deviceId, deviceId),
      eq(rfidUsers.isActive, true),
      sql`lower(trim(${rfidUsers.cardId})) = ${cardId.toLowerCase()}`,
    )).limit(1)
    if (duplicateCard) return NextResponse.json({ error: "That RFID card is already active for this device." }, { status: 409 })

    const [user] = await db.insert(rfidUsers).values({ deviceId, userName, cardId })
      .onConflictDoNothing().returning({ id: rfidUsers.id })
    if (!user) return NextResponse.json({ error: "That RFID card is already active for this device." }, { status: 409 })
    return NextResponse.json({ user }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "RFID user could not be registered." }, { status: 503 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!(await getMaintainerUser())) return adminDenied()
  } catch {
    return NextResponse.json({ error: "Admin access could not be verified." }, { status: 503 })
  }
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 })

  const id = request.nextUrl.searchParams.get("id")
  const deviceId = request.nextUrl.searchParams.get("deviceId")
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !validDeviceId(deviceId)) {
    return NextResponse.json({ error: "Invalid RFID user." }, { status: 400 })
  }

  try {
    const [deactivated] = await db.update(rfidUsers).set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(rfidUsers.id, id), eq(rfidUsers.deviceId, deviceId), eq(rfidUsers.isActive, true)))
      .returning({ id: rfidUsers.id })
    if (!deactivated) return NextResponse.json({ error: "Active RFID user not found." }, { status: 404 })
    return NextResponse.json({ deactivated: true })
  } catch {
    return NextResponse.json({ error: "RFID access could not be deactivated." }, { status: 503 })
  }
}

import { and, asc, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { deviceMaintainers, devices, products } from "@/lib/db/schema"
import { hashMaintainerPassword } from "@/lib/maintainer-auth"
import { DEFAULT_DEVICE_ID } from "@/lib/device-routes"
import { isSameOriginRequest } from "@/lib/request-origin"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^\+?[0-9][0-9\s().-]{5,30}$/

async function adminDenied() {
  try {
    return await getAdminUser() ? null : NextResponse.json({ error: "Admin access required." }, { status: 401 })
  } catch {
    return NextResponse.json({ error: "Admin access could not be verified." }, { status: 503 })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validCredentials(nameValue: unknown, contactValue: unknown, emailValue: unknown, passwordValue: unknown) {
  const name = typeof nameValue === "string" ? nameValue.trim().replace(/\s+/g, " ") : ""
  const contact = typeof contactValue === "string" ? contactValue.trim() : ""
  const email = typeof emailValue === "string" ? emailValue.trim().toLowerCase() : ""
  const password = typeof passwordValue === "string" ? passwordValue : ""
  if (
    name.length < 2 || name.length > 120 ||
    !PHONE_PATTERN.test(contact) || contact.length > 32 ||
    !EMAIL_PATTERN.test(email) || email.length > 254 ||
    password.length < 12 || password.length > 1024
  ) return null
  return { name, contact, email, password }
}

function newDeviceId() {
  return `BB-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`
}

function isUniqueViolation(error: unknown, depth = 0): boolean {
  if (depth > 4 || typeof error !== "object" || error === null) return false
  if ("code" in error && error.code === "23505") return true
  return "cause" in error && isUniqueViolation(error.cause, depth + 1)
}

export async function GET() {
  const denied = await adminDenied()
  if (denied) return denied

  try {
    const rows = await db
      .select({
        deviceId: devices.deviceId,
        universityName: devices.universityName,
        locationName: devices.locationName,
        isActive: devices.isActive,
        maintainerName: deviceMaintainers.name,
        maintainerContact: deviceMaintainers.contact,
        maintainerEmail: deviceMaintainers.email,
      })
      .from(devices)
      .leftJoin(deviceMaintainers, eq(deviceMaintainers.deviceId, devices.deviceId))
      .orderBy(asc(devices.universityName), asc(devices.locationName))

    return NextResponse.json({ devices: rows }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[admin devices] Unable to load devices:", error)
    return NextResponse.json({ error: "Devices could not be loaded." }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  const denied = await adminDenied()
  if (denied) return denied
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 })

  const body: unknown = await request.json().catch(() => null)
  if (!isRecord(body)) return NextResponse.json({ error: "Check the device details and try again." }, { status: 400 })

  const universityName = typeof body.universityName === "string" ? body.universityName.trim().replace(/\s+/g, " ") : ""
  const locationName = typeof body.locationName === "string" ? body.locationName.trim().replace(/\s+/g, " ") : ""
  const credentials = validCredentials(body.maintainerName, body.maintainerContact, body.maintainerEmail, body.maintainerPassword)
  if (!credentials || universityName.length < 2 || universityName.length > 160 || locationName.length < 2 || locationName.length > 160) {
    return NextResponse.json({ error: "Enter a campus, location, maintainer name, valid contact number, email, and a password of at least 12 characters." }, { status: 400 })
  }

  try {
    const deviceId = newDeviceId()
    const passwordHash = await hashMaintainerPassword(credentials.password)
    await db.transaction(async (tx) => {
      await tx.insert(devices).values({ deviceId, universityName, locationName })
      await tx.insert(deviceMaintainers).values({
        deviceId,
        name: credentials.name,
        contact: credentials.contact,
        email: credentials.email,
        passwordHash,
      })
      const defaultProducts = await tx.select().from(products).where(eq(products.deviceId, DEFAULT_DEVICE_ID))
      if (defaultProducts.length > 0) {
        const now = new Date()
        await tx.insert(products).values(defaultProducts.map((product) => ({
          id: `${product.id}-${crypto.randomUUID()}`,
          deviceId,
          name: product.name,
          description: product.description,
          pricePaisa: product.pricePaisa,
          imageUrl: product.imageUrl,
          stock: product.stock,
          isActive: product.isActive,
          sortOrder: product.sortOrder,
          createdAt: now,
          updatedAt: now,
        })))
      }
    })
    return NextResponse.json({
      device: {
        deviceId,
        universityName,
        locationName,
        isActive: true,
        maintainerName: credentials.name,
        maintainerContact: credentials.contact,
        maintainerEmail: credentials.email,
      },
    }, { status: 201 })
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "That maintainer email is already assigned, or the device could not be created." }, { status: 409 })
    }
    console.error("[admin devices] Unable to create device:", error)
    return NextResponse.json({ error: "The device could not be created." }, { status: 503 })
  }
}

export async function PUT(request: NextRequest) {
  const denied = await adminDenied()
  if (denied) return denied
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 })

  const body: unknown = await request.json().catch(() => null)
  if (!isRecord(body)) return NextResponse.json({ error: "Check the maintainer details and try again." }, { status: 400 })

  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : ""
  const credentials = validCredentials(body.maintainerName, body.maintainerContact, body.maintainerEmail, body.maintainerPassword)
  if (!/^[A-Z0-9_-]{1,64}$/.test(deviceId) || !credentials) {
    return NextResponse.json({ error: "Enter a maintainer name, valid contact number, email, and a password of at least 12 characters." }, { status: 400 })
  }

  try {
    const [activeDevice] = await db
      .select({ deviceId: devices.deviceId })
      .from(devices)
      .where(and(eq(devices.deviceId, deviceId), eq(devices.isActive, true)))
      .limit(1)
    if (!activeDevice) return NextResponse.json({ error: "Active device not found." }, { status: 404 })

    const passwordHash = await hashMaintainerPassword(credentials.password)
    await db.insert(deviceMaintainers).values({
      deviceId,
      name: credentials.name,
      contact: credentials.contact,
      email: credentials.email,
      passwordHash,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: deviceMaintainers.deviceId,
      set: {
        name: credentials.name,
        contact: credentials.contact,
        email: credentials.email,
        passwordHash,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({
      maintainerName: credentials.name,
      maintainerContact: credentials.contact,
      maintainerEmail: credentials.email,
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "That maintainer email is already assigned to another device." }, { status: 409 })
    }
    console.error("[admin devices] Unable to save maintainer:", error)
    return NextResponse.json({ error: "Maintainer details could not be saved." }, { status: 503 })
  }
}

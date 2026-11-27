import { and, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getAdminUser } from "@/lib/admin-auth"
import { isSameOriginRequest } from "@/lib/request-origin"
import { db } from "@/lib/db"
import { devices, products } from "@/lib/db/schema"
import { BEVERAGE_STOCK_LIMIT } from "@/lib/inventory"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ productId: string }> }

function validateProduct(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const name = typeof input.name === "string" ? input.name.trim() : ""
  const description = typeof input.description === "string" ? input.description.trim() : ""
  const image = typeof input.image === "string" ? input.image.trim() : ""
  const { pricePaisa, stock, sortOrder, isActive } = input

  if (
    name.length < 1 || name.length > 120 ||
    description.length > 1000 || image.length > 2048 ||
    !Number.isInteger(pricePaisa) || Number(pricePaisa) < 1 || Number(pricePaisa) > 100_000_000 ||
    !Number.isInteger(stock) || Number(stock) < 0 || Number(stock) > BEVERAGE_STOCK_LIMIT ||
    !Number.isInteger(sortOrder) || Number(sortOrder) < 0 || Number(sortOrder) > 100_000 ||
    typeof isActive !== "boolean"
  ) return null

  if (image && !(/^\/(?!\/)/.test(image) || /^https:\/\//i.test(image))) return null

  return {
    name,
    description,
    imageUrl: image,
    pricePaisa: Number(pricePaisa),
    stock: Number(stock),
    sortOrder: Number(sortOrder),
    isActive,
    updatedAt: new Date(),
  }
}

async function adminResponse() {
  try {
    return await getAdminUser() ? null : NextResponse.json({ error: "Admin access required." }, { status: 401 })
  } catch {
    return NextResponse.json({ error: "Admin access could not be verified." }, { status: 503 })
  }
}

function validDeviceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z0-9_-]{1,64}$/.test(value)
}

async function activeDeviceExists(deviceId: string) {
  const [device] = await db.select({ deviceId: devices.deviceId }).from(devices)
    .where(and(eq(devices.deviceId, deviceId), eq(devices.isActive, true))).limit(1)
  return Boolean(device)
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const denied = await adminResponse()
  if (denied) return denied
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 })

  const { productId } = await params
  const body: unknown = await request.json().catch(() => null)
  const product = validateProduct(body)
  const deviceId = typeof body === "object" && body !== null && !Array.isArray(body) && "deviceId" in body
    ? body.deviceId
    : null
  if (!product) return NextResponse.json({ error: "Check the product details and try again." }, { status: 400 })
  if (!validDeviceId(deviceId)) return NextResponse.json({ error: "Select a valid device." }, { status: 400 })

  try {
    if (!(await activeDeviceExists(deviceId))) return NextResponse.json({ error: "Active device not found." }, { status: 404 })
    const [updated] = await db.update(products).set(product)
      .where(and(eq(products.id, productId), eq(products.deviceId, deviceId)))
      .returning()
    if (!updated) return NextResponse.json({ error: "Product not found." }, { status: 404 })
    return NextResponse.json({ product: { ...product, id: updated.id, image: updated.imageUrl } })
  } catch {
    return NextResponse.json({ error: "Product could not be updated." }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const denied = await adminResponse()
  if (denied) return denied
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 })

  const { productId } = await params
  const deviceId = request.nextUrl.searchParams.get("deviceId")
  if (!validDeviceId(deviceId)) return NextResponse.json({ error: "Select a valid device." }, { status: 400 })
  try {
    if (!(await activeDeviceExists(deviceId))) return NextResponse.json({ error: "Active device not found." }, { status: 404 })
    const [archived] = await db.update(products)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(products.id, productId), eq(products.deviceId, deviceId)))
      .returning({ id: products.id })
    if (!archived) return NextResponse.json({ error: "Product not found." }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Product could not be archived." }, { status: 500 })
  }
}

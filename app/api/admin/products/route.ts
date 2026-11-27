import { and, asc, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getAdminUser } from "@/lib/admin-auth"
import { isSameOriginRequest } from "@/lib/request-origin"
import { db } from "@/lib/db"
import { devices, products } from "@/lib/db/schema"
import { BEVERAGE_STOCK_LIMIT } from "@/lib/inventory"

export const dynamic = "force-dynamic"

function serializeProduct(product: typeof products.$inferSelect) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    pricePaisa: product.pricePaisa,
    image: product.imageUrl,
    stock: product.stock,
    isActive: product.isActive,
    sortOrder: product.sortOrder,
  }
}

function validateProduct(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const name = typeof input.name === "string" ? input.name.trim() : ""
  const description = typeof input.description === "string" ? input.description.trim() : ""
  const image = typeof input.image === "string" ? input.image.trim() : ""
  const pricePaisa = input.pricePaisa
  const stock = input.stock
  const sortOrder = input.sortOrder
  const isActive = input.isActive

  if (
    name.length < 1 || name.length > 120 ||
    description.length > 1000 ||
    image.length > 2048 ||
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

export async function GET(request: NextRequest) {
  const denied = await adminResponse()
  if (denied) return denied
  const deviceId = request.nextUrl.searchParams.get("deviceId")
  if (!validDeviceId(deviceId)) return NextResponse.json({ error: "Select a valid device." }, { status: 400 })

  try {
    if (!(await activeDeviceExists(deviceId))) return NextResponse.json({ error: "Active device not found." }, { status: 404 })
    const rows = await db.select().from(products)
      .where(eq(products.deviceId, deviceId))
      .orderBy(asc(products.sortOrder), asc(products.name))
    return NextResponse.json({ products: rows.map(serializeProduct) }, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json({ error: "Products could not be loaded." }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  const denied = await adminResponse()
  if (denied) return denied
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 })

  const body: unknown = await request.json().catch(() => null)
  const product = validateProduct(body)
  const deviceId = typeof body === "object" && body !== null && !Array.isArray(body) && "deviceId" in body
    ? body.deviceId
    : null
  if (!product) return NextResponse.json({ error: "Check the product details and try again." }, { status: 400 })
  if (!validDeviceId(deviceId)) return NextResponse.json({ error: "Select a valid device." }, { status: 400 })

  const slug = product.name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "product"
  const id = `${slug}-${crypto.randomUUID().slice(0, 8)}`

  try {
    if (!(await activeDeviceExists(deviceId))) return NextResponse.json({ error: "Active device not found." }, { status: 404 })
    const [created] = await db.insert(products).values({ id, deviceId, ...product }).returning()
    return NextResponse.json({ product: serializeProduct(created) }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Product could not be created." }, { status: 409 })
  }
}

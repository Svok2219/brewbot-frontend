import { NextResponse } from "next/server"
import { NextRequest } from "next/server"
import { getActiveProducts } from "@/lib/products"
import { getActiveDevice } from "@/lib/device-registry"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const deviceId = request.nextUrl.searchParams.get("deviceId")
  if (!deviceId || !/^[A-Z0-9_-]{1,64}$/.test(deviceId)) {
    return NextResponse.json({ error: "A valid device is required." }, { status: 400 })
  }

  try {
    if (!(await getActiveDevice(deviceId))) return NextResponse.json({ error: "Device not found." }, { status: 404 })
    return NextResponse.json({ products: await getActiveProducts(deviceId) }, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json({ error: "The menu is temporarily unavailable." }, { status: 503 })
  }
}

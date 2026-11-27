import { get } from "@vercel/blob"
import { NextRequest, NextResponse } from "next/server"
import { getActiveCampaignPrivateArtworkPath } from "@/lib/campaigns"
import { getActiveDevice } from "@/lib/device-registry"

export const dynamic = "force-dynamic"

const cacheControl = "public, max-age=0, must-revalidate"

export async function GET(request: NextRequest) {
  const deviceId = request.nextUrl.searchParams.get("deviceId")
  if (!deviceId || !/^[A-Z0-9_-]{1,64}$/.test(deviceId)) {
    return NextResponse.json({ error: "A valid device is required." }, { status: 400 })
  }

  try {
    // Campaign artwork is intentionally public; only serve the active campaign's stored image.
    if (!(await getActiveDevice(deviceId))) return new NextResponse(null, { status: 404 })
    const pathname = await getActiveCampaignPrivateArtworkPath(deviceId)
    if (!pathname) return new NextResponse(null, { status: 404 })

    const result = await get(pathname, {
      access: "private",
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    })
    if (!result) return new NextResponse(null, { status: 404 })

    const headers = {
      "Cache-Control": cacheControl,
      ETag: result.blob.etag,
      "X-Content-Type-Options": "nosniff",
    }
    if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers })

    return new NextResponse(result.stream, {
      headers: {
        ...headers,
        "Content-Type": result.blob.contentType,
      },
    })
  } catch (error) {
    console.error("[campaign artwork] Unable to serve artwork:", error)
    return NextResponse.json({ error: "Campaign artwork is temporarily unavailable." }, { status: 503 })
  }
}

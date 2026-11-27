import { del, put } from "@vercel/blob"
import { NextRequest, NextResponse } from "next/server"
import { getAdminUser } from "@/lib/admin-auth"
import { isSameOriginRequest } from "@/lib/request-origin"
import { getActiveDevice } from "@/lib/device-registry"
import {
  deactivateActiveCampaign,
  getActiveCampaign,
  getActiveCampaignPrivateArtworkPath,
  isPrivateCampaignArtworkUrl,
  saveActiveCampaign,
  storePrivateCampaignArtworkPath,
} from "@/lib/campaigns"

export const dynamic = "force-dynamic"

const MAX_ARTWORK_BYTES = 4 * 1024 * 1024
const artworkExtensions: Record<string, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

async function adminResponse() {
  try {
    return await getAdminUser() ? null : NextResponse.json({ error: "Admin access required." }, { status: 401 })
  } catch {
    return NextResponse.json({ error: "Admin access could not be verified." }, { status: 503 })
  }
}

function isAllowedArtworkUrl(value: string) {
  return !value || /^\/(?!\/)/.test(value) || /^https:\/\//i.test(value)
}

function isAllowedTargetUrl(value: string) {
  if (!value) return true
  try {
    const url = new URL(value)
    return (url.protocol === "https:" || url.protocol === "http:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
  } catch {
    return false
  }
}

function validDeviceId(value: string | null): value is string {
  return Boolean(value && /^[A-Z0-9_-]{1,64}$/.test(value))
}

export async function GET(request: NextRequest) {
  const denied = await adminResponse()
  if (denied) return denied
  const deviceId = request.nextUrl.searchParams.get("deviceId")
  if (!validDeviceId(deviceId)) return NextResponse.json({ error: "Select a valid device." }, { status: 400 })

  try {
    if (!(await getActiveDevice(deviceId))) return NextResponse.json({ error: "Active device not found." }, { status: 404 })
    return NextResponse.json({ campaign: await getActiveCampaign(deviceId) }, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json({ error: "Campaign could not be loaded." }, { status: 503 })
  }
}

export async function PUT(request: NextRequest) {
  const denied = await adminResponse()
  if (denied) return denied
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "Campaign details could not be read." }, { status: 400 })
  }

  const headline = formData.get("headline")
  const supportingText = formData.get("supportingText")
  const rawDeviceId = formData.get("deviceId")
  const rawArtworkUrl = formData.get("artworkUrl")
  const rawTargetUrl = formData.get("targetUrl")
  const rawArtwork = formData.get("artwork")
  const deviceId = typeof rawDeviceId === "string" && /^[A-Z0-9_-]{1,64}$/.test(rawDeviceId) ? rawDeviceId : null
  const artworkUrl = typeof rawArtworkUrl === "string" ? rawArtworkUrl.trim() : ""
  const targetUrl = typeof rawTargetUrl === "string" ? rawTargetUrl.trim() : ""

  if (
    !deviceId ||
    typeof headline !== "string" || headline.trim().length < 1 || headline.trim().length > 100 ||
    typeof supportingText !== "string" || supportingText.trim().length > 400 ||
    typeof rawArtworkUrl !== "string" || artworkUrl.length > 2048 || !isAllowedArtworkUrl(artworkUrl) ||
    (rawTargetUrl !== null && typeof rawTargetUrl !== "string") ||
    targetUrl.length > 2048 || !isAllowedTargetUrl(targetUrl) ||
    (rawArtwork !== null && !(rawArtwork instanceof File))
  ) {
    return NextResponse.json({ error: "Check the campaign details and try again." }, { status: 400 })
  }
  if (!(await getActiveDevice(deviceId))) return NextResponse.json({ error: "Active device not found." }, { status: 404 })
  const isPrivateArtworkUrl = isPrivateCampaignArtworkUrl(artworkUrl, deviceId)
  if (artworkUrl.startsWith("/api/campaign/artwork") && !isPrivateArtworkUrl) {
    return NextResponse.json({ error: "Campaign artwork does not belong to this device." }, { status: 400 })
  }

  let uploadedArtwork: { url: string; pathname: string } | null = null
  if (rawArtwork instanceof File && rawArtwork.size > 0) {
    const contentType = rawArtwork.type.toLowerCase()
    const extension = artworkExtensions[contentType]
    if (!extension || rawArtwork.size > MAX_ARTWORK_BYTES) {
      return NextResponse.json({ error: "Choose a supported image smaller than 4 MB." }, { status: 400 })
    }

    try {
      uploadedArtwork = await put(`campaigns/${crypto.randomUUID()}.${extension}`, rawArtwork, {
        access: "private",
        addRandomSuffix: false,
        contentType,
      })
    } catch (error) {
      console.error("[admin campaign] Artwork upload failed:", error)
      return NextResponse.json({
        error: "Campaign artwork could not be uploaded. The existing campaign was not changed.",
      }, { status: 503 })
    }
  }

  try {
    const existingPrivateArtworkPath = !uploadedArtwork && isPrivateArtworkUrl
      ? await getActiveCampaignPrivateArtworkPath(deviceId)
      : null
    if (isPrivateArtworkUrl && !uploadedArtwork && !existingPrivateArtworkPath) {
      return NextResponse.json({ error: "Campaign artwork could not be verified." }, { status: 409 })
    }

    const savedArtworkUrl = uploadedArtwork
      ? storePrivateCampaignArtworkPath(uploadedArtwork.pathname)
      : existingPrivateArtworkPath
        ? storePrivateCampaignArtworkPath(existingPrivateArtworkPath)
        : artworkUrl || null
    const campaign = await saveActiveCampaign(deviceId, {
      headline: headline.trim(),
      supportingText: supportingText.trim(),
      targetUrl: targetUrl || null,
      artworkUrl: savedArtworkUrl,
    })
    return NextResponse.json({ campaign }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[admin campaign] Campaign save failed:", error)
    if (uploadedArtwork) await del(uploadedArtwork.url).catch(() => undefined)
    return NextResponse.json({ error: "Campaign could not be saved." }, { status: 503 })
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await adminResponse()
  if (denied) return denied
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 })

  const deviceId = request.nextUrl.searchParams.get("deviceId")
  if (!validDeviceId(deviceId)) return NextResponse.json({ error: "Select a valid device." }, { status: 400 })

  try {
    if (!(await getActiveDevice(deviceId))) return NextResponse.json({ error: "Active device not found." }, { status: 404 })
    await deactivateActiveCampaign(deviceId)
    return NextResponse.json({ campaign: null }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[admin campaign] Campaign deactivation failed:", error)
    return NextResponse.json({ error: "Campaign could not be deactivated." }, { status: 503 })
  }
}

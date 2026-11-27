import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { campaigns } from "@/lib/db/schema"

export type BrewbotCampaign = {
  id: string
  headline: string
  supportingText: string
  targetUrl: string | null
  artworkUrl: string | null
}

const PRIVATE_ARTWORK_PREFIX = "private-blob:"
const PRIVATE_CAMPAIGN_ARTWORK_PATH = "/api/campaign/artwork"
const privateArtworkPathPattern = /^campaigns\/[0-9a-f-]{36}\.(?:avif|gif|jpg|png|webp)$/i

export function getPrivateCampaignArtworkUrl(deviceId: string, revision?: number) {
  const version = revision === undefined ? "" : `&v=${revision}`
  return `${PRIVATE_CAMPAIGN_ARTWORK_PATH}?deviceId=${encodeURIComponent(deviceId)}${version}`
}

export function isPrivateCampaignArtworkUrl(value: string, deviceId: string) {
  const url = new URL(value, "https://brewbot.invalid")
  const revisions = url.searchParams.getAll("v")
  return url.origin === "https://brewbot.invalid" &&
    url.pathname === PRIVATE_CAMPAIGN_ARTWORK_PATH &&
    url.hash === "" &&
    url.searchParams.getAll("deviceId").length === 1 &&
    url.searchParams.get("deviceId") === deviceId &&
    revisions.length <= 1 &&
    (revisions.length === 0 || /^\d+$/.test(revisions[0])) &&
    [...url.searchParams.keys()].every((key) => key === "deviceId" || key === "v")
}

export function storePrivateCampaignArtworkPath(pathname: string) {
  if (!privateArtworkPathPattern.test(pathname)) throw new Error("Invalid campaign artwork path.")
  return `${PRIVATE_ARTWORK_PREFIX}${pathname}`
}

function parsePrivateCampaignArtworkPath(value: string | null) {
  if (!value?.startsWith(PRIVATE_ARTWORK_PREFIX)) return null
  const pathname = value.slice(PRIVATE_ARTWORK_PREFIX.length)
  return privateArtworkPathPattern.test(pathname) ? pathname : null
}

function serializeCampaign(campaign: typeof campaigns.$inferSelect): BrewbotCampaign {
  const privateArtworkPath = parsePrivateCampaignArtworkPath(campaign.artworkUrl)
  return {
    id: campaign.id,
    headline: campaign.headline,
    supportingText: campaign.supportingText,
    targetUrl: campaign.targetUrl,
    artworkUrl: privateArtworkPath
      ? getPrivateCampaignArtworkUrl(campaign.deviceId, campaign.updatedAt.getTime())
      : campaign.artworkUrl,
  }
}

export async function getActiveCampaignPrivateArtworkPath(deviceId: string) {
  const [campaign] = await db
    .select({ artworkUrl: campaigns.artworkUrl })
    .from(campaigns)
    .where(and(eq(campaigns.deviceId, deviceId), eq(campaigns.isActive, true)))
    .limit(1)

  return parsePrivateCampaignArtworkPath(campaign?.artworkUrl ?? null)
}

export async function getActiveCampaign(deviceId: string) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.deviceId, deviceId), eq(campaigns.isActive, true)))
    .limit(1)

  return campaign ? serializeCampaign(campaign) : null
}

export async function saveActiveCampaign(deviceId: string, input: Omit<BrewbotCampaign, "id">) {
  const updatedAt = new Date()
  const [campaign] = await db
    .insert(campaigns)
    .values({
      deviceId,
      headline: input.headline,
      supportingText: input.supportingText,
      targetUrl: input.targetUrl,
      artworkUrl: input.artworkUrl,
      isActive: true,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: campaigns.deviceId,
      targetWhere: sql`${campaigns.isActive} = true`,
      set: {
        headline: input.headline,
        supportingText: input.supportingText,
        targetUrl: input.targetUrl,
        artworkUrl: input.artworkUrl,
        updatedAt,
      },
    })
    .returning()

  if (!campaign) throw new Error("Campaign could not be saved.")
  return serializeCampaign(campaign)
}

export async function deactivateActiveCampaign(deviceId: string) {
  const [campaign] = await db
    .update(campaigns)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(campaigns.deviceId, deviceId), eq(campaigns.isActive, true)))
    .returning({ id: campaigns.id })

  return Boolean(campaign)
}

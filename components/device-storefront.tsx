"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Building2, MapPin, UserRound } from "lucide-react"
import useSWR from "swr"
import { BrewBotLogo } from "@/components/brewbot-logo"
import type { BrewbotCampaign } from "@/lib/campaigns"
import type { BrewbotProduct } from "@/lib/products"

type ProductResponse = { products: BrewbotProduct[] }
type CampaignResponse = { campaign: BrewbotCampaign | null }

async function fetchProducts(url: string): Promise<ProductResponse> {
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) throw new Error("The menu could not be loaded.")
  return response.json() as Promise<ProductResponse>
}

async function fetchCampaign(url: string): Promise<CampaignResponse> {
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) throw new Error("The campaign could not be loaded.")
  return response.json() as Promise<CampaignResponse>
}

type DeviceStorefrontProps = {
  deviceId: string
  universityName: string
  locationName: string
  initialProducts: BrewbotProduct[]
  initialCampaign: BrewbotCampaign | null
}

export function DeviceStorefront({ deviceId, universityName, locationName, initialProducts, initialCampaign }: DeviceStorefrontProps) {
  const router = useRouter()
  const productsUrl = `/api/products?deviceId=${encodeURIComponent(deviceId)}`
  const campaignUrl = `/api/campaign?deviceId=${encodeURIComponent(deviceId)}`
  const { data, error } = useSWR<ProductResponse>(productsUrl, fetchProducts, {
    fallbackData: { products: initialProducts },
    refreshInterval: 5000,
    revalidateOnFocus: true,
  })
  const { data: campaignData } = useSWR<CampaignResponse>(campaignUrl, fetchCampaign, {
    fallbackData: { campaign: initialCampaign },
    refreshInterval: 5000,
    revalidateOnFocus: true,
  })
  const products = data?.products ?? []
  const campaign = campaignData?.campaign ?? null
  const campaignContent = campaign ? (
    <>
      {campaign.artworkUrl && (
        <div className="kiosk-ad-artwork">
          <Image src={campaign.artworkUrl} alt={`${campaign.headline} campaign artwork`} fill sizes="96px" unoptimized />
        </div>
      )}
      <div className="kiosk-ad-copy">
        <span>FEATURED CAMPAIGN</span>
        <strong>{campaign.headline}</strong>
        {campaign.supportingText && <p>{campaign.supportingText}</p>}
      </div>
    </>
  ) : null
  const latestStockUpdate = products.reduce(
    (latest, product) => Math.max(latest, Date.parse(product.updatedAt)),
    0,
  )
  const stockUpdatedAt = latestStockUpdate
    ? new Intl.DateTimeFormat("en-BD", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Dhaka",
      }).format(latestStockUpdate)
    : null
  const displayUniversityName = universityName.trim() === "Dhaka University" ? "University of Dhaka" : universityName
  const buy = (id: string) => router.push(`/checkout?product=${encodeURIComponent(id)}&deviceId=${encodeURIComponent(deviceId)}`)

  return (
    <main className="kiosk-screen">
      <section className="kiosk-location" aria-label="Device location">
        <div className="kiosk-location-header">
          <div className="kiosk-location-details">
            <div className="kiosk-location-title"><Building2 className="kiosk-building-icon" aria-hidden="true"/><h1>{displayUniversityName}</h1></div>
            <p className="kiosk-hall"><MapPin size={17} fill="currentColor"/> {locationName}</p>
            {stockUpdatedAt && <p className="kiosk-last-stock">Last stocked: {stockUpdatedAt}</p>}
          </div>
          <div className="kiosk-brand-stack">
            <BrewBotLogo className="kiosk-brand" />
            <Link className="kiosk-wallet-fab" href={`/account?deviceId=${encodeURIComponent(deviceId)}`} aria-label="Open BrewBot account and wallet">
              <UserRound aria-hidden="true" />
            </Link>
          </div>
        </div>
        <span className="kiosk-device-id">{deviceId}</span>
      </section>

      <section className="kiosk-products" aria-label="Available drinks" aria-live="polite">
        {error && <p className="kiosk-menu-message" role="status">The menu is temporarily unavailable. Please try again shortly.</p>}
        {!error && !data && <p className="kiosk-menu-message">Loading today&apos;s menu…</p>}
        {data && products.length === 0 && <p className="kiosk-menu-message">No products are currently available.</p>}
        {products.map((product) => (
          <article className="kiosk-product" key={product.id}>
            <div className="kiosk-product-image"><Image src={product.image || "/coffee-cup.png"} alt={product.name} fill sizes="64px" unoptimized /></div>
            <div className="kiosk-product-info">
              <h2>{product.name}</h2>
              <p><span>Stock: {product.stock} cups</span><strong>{(product.pricePaisa / 100).toFixed(2)} Tk</strong></p>
              {product.description && <small>{product.description}</small>}
            </div>
            <button className="kiosk-buy" type="button" onClick={() => buy(product.id)} disabled={product.stock <= 0} aria-label={product.stock > 0 ? `Buy ${product.name}` : `${product.name} is sold out`}>{product.stock > 0 ? "Buy" : "Sold out"}</button>
          </article>
        ))}
      </section>

      <aside className={`kiosk-ad-slot${campaign ? " has-campaign" : ""}`} aria-label={campaign ? `Advertisement: ${campaign.headline}` : "Advertisement"}>
        {campaign ? campaign.targetUrl ? (
          <a
            className="kiosk-ad-link"
            href={campaign.targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${campaign.headline} advertiser page in a new tab`}
          >
            {campaignContent}
          </a>
        ) : campaignContent : (
          <div className="kiosk-ad-copy">
            <span>LIVE CAMPAIGNS</span>
            <strong>No active campaign</strong>
            <p>Published promotions will appear here.</p>
          </div>
        )}
      </aside>

    </main>
  )
}

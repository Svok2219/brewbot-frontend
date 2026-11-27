import type { Metadata } from "next"
import { AccountPortal } from "@/components/account-portal"
import { DEFAULT_DEVICE_ID } from "@/lib/device-routes"

export const metadata: Metadata = {
  title: "BrewBot Account & Wallet",
  description: "Sign in to your BrewBot wallet and use your shared balance across devices.",
}

export const dynamic = "force-dynamic"

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ deviceId?: string; resultToken?: string }>
}) {
  const params = await searchParams
  const deviceId = params.deviceId && /^[A-Z0-9_-]{1,64}$/.test(params.deviceId)
    ? params.deviceId
    : DEFAULT_DEVICE_ID
  const resultToken = params.resultToken && /^[0-9a-f-]{36}$/i.test(params.resultToken)
    ? params.resultToken
    : undefined
  return <AccountPortal deviceId={deviceId} resultToken={resultToken} />
}

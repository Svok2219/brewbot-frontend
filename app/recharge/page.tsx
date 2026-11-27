import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { DEFAULT_DEVICE_ID } from "@/lib/device-routes"

export const metadata: Metadata = {
  title: "BrewBot Account & Wallet",
  description: "Sign in to your universal BrewBot wallet or add balance through EPS."
}

type RechargePageProps = { searchParams: Promise<{ deviceId?: string; resultToken?: string }> }

export default async function RechargePage({ searchParams }: RechargePageProps) {
  const params = await searchParams
  const deviceId = params.deviceId && /^[A-Z0-9_-]{1,64}$/.test(params.deviceId) ? params.deviceId : DEFAULT_DEVICE_ID
  const query = new URLSearchParams({ deviceId })
  if (params.resultToken && /^[0-9a-f-]{36}$/i.test(params.resultToken)) query.set("resultToken", params.resultToken)
  redirect(`/account?${query}`)
}

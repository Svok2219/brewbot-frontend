import { notFound } from "next/navigation"
import { DeviceStorefront } from "@/components/device-storefront"
import { getActiveDevice } from "@/lib/device-registry"
import { getActiveProducts } from "@/lib/products"
import { getActiveCampaign } from "@/lib/campaigns"

export const dynamic = "force-dynamic"

type DevicePageProps = {
  params: Promise<{ deviceId: string }>
}

export default async function DevicePage({ params }: DevicePageProps) {
  const { deviceId } = await params
  const device = await getActiveDevice(deviceId)

  if (!device) notFound()

  const [products, campaign] = await Promise.all([
    getActiveProducts(device.deviceId),
    getActiveCampaign(device.deviceId),
  ])

  return (
    <DeviceStorefront
      deviceId={device.deviceId}
      universityName={device.universityName}
      locationName={device.locationName}
      initialProducts={products}
      initialCampaign={campaign}
    />
  )
}

import { eq } from "drizzle-orm"
import { CheckoutScreen } from "@/components/checkout-screen"
import { db } from "@/lib/db"
import { deviceMaintainers } from "@/lib/db/schema"
import { getBrewbotProduct } from "@/lib/products"
import { DEFAULT_DEVICE_ID } from "@/lib/device-routes"

type CheckoutPageProps = {
  searchParams: Promise<{ product?: string; deviceId?: string }>
}

export const dynamic = "force-dynamic"

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const { product, deviceId } = await searchParams
  const resolvedDeviceId = deviceId === undefined
    ? DEFAULT_DEVICE_ID
    : /^[A-Z0-9_-]{1,64}$/.test(deviceId) ? deviceId : null
  const [selectedProduct, maintainers] = await Promise.all([
    resolvedDeviceId ? getBrewbotProduct(product, resolvedDeviceId) : Promise.resolve(null),
    resolvedDeviceId
      ? db.select({
          name: deviceMaintainers.name,
          contact: deviceMaintainers.contact,
        }).from(deviceMaintainers)
        .where(eq(deviceMaintainers.deviceId, resolvedDeviceId)).limit(1)
      : Promise.resolve([]),
  ])
  return (
    <CheckoutScreen
      product={selectedProduct}
      requestedDeviceId={resolvedDeviceId ?? undefined}
      maintainerName={maintainers[0]?.name ?? null}
      maintainerContact={maintainers[0]?.contact ?? null}
    />
  )
}

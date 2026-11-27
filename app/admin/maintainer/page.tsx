import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { MaintainerAdmin } from "@/components/maintainer-admin"
import { getMaintainerAccess } from "@/lib/maintainer-auth"
import { db } from "@/lib/db"
import { devices } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export const metadata: Metadata = {
  title: "Device maintainer | BrewBot",
  description: "Review kiosk status and manage RFID user access for a BrewBot device.",
}

export default async function MaintainerPage() {
  const deviceId = await getMaintainerAccess()
  if (!deviceId) redirect("/admin/maintainer/sign-in")

  const [device] = await db.select({
    deviceId: devices.deviceId,
    universityName: devices.universityName,
    locationName: devices.locationName,
  }).from(devices).where(eq(devices.deviceId, deviceId)).limit(1)
  if (!device) redirect("/admin/maintainer/sign-in")

  return <MaintainerAdmin device={device} />
}

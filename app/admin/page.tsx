import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { asc, eq } from "drizzle-orm"
import { OwnerAdmin } from "@/components/owner-admin"
import { getAdminAccess } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { devices } from "@/lib/db/schema"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Owner workspace | BrewBot",
  description: "Review BrewBot device status, order records, product content, and advertisements.",
}

export default async function AdminPage() {
  const { authorized } = await getAdminAccess()
  if (!authorized) redirect("/admin/sign-in")
  const activeDevices = await db.select({
    deviceId: devices.deviceId,
    universityName: devices.universityName,
    locationName: devices.locationName,
  }).from(devices).where(eq(devices.isActive, true)).orderBy(asc(devices.universityName), asc(devices.locationName))
  return <OwnerAdmin initialDevices={activeDevices} />
}

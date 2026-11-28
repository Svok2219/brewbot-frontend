import { createHmac, timingSafeEqual } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { cookies } from "next/headers"
import { adminAccounts } from "@/lib/db/schema"
import { db } from "@/lib/db"

export const ADMIN_SESSION_COOKIE = "brewbot_admin_session"
export const ADMIN_SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7

function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET ?? process.env.BETTER_AUTH_SECRET
  if (!secret || secret.length < 32) {
    throw new Error("A session signing secret of at least 32 characters is required.")
  }
  return secret
}

function sign(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url")
}

export function createAdminSessionToken(adminId: number) {
  const payload = `${adminId}.${Date.now() + ADMIN_SESSION_DURATION_SECONDS * 1000}`
  return `${payload}.${sign(payload)}`
}

function readAdminSessionToken(token: string) {
  const [adminIdValue, expiresAtValue, providedSignature, ...extra] = token.split(".")
  if (extra.length || !/^\d+$/.test(adminIdValue) || !/^\d+$/.test(expiresAtValue)) return null

  const adminId = Number(adminIdValue)
  const expiresAt = Number(expiresAtValue)
  if (!Number.isSafeInteger(adminId) || adminId <= 0 || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) {
    return null
  }

  const payload = `${adminIdValue}.${expiresAtValue}`
  const expectedSignature = Buffer.from(sign(payload), "base64url")
  const actualSignature = Buffer.from(providedSignature ?? "", "base64url")
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
    return null
  }

  return adminId
}

export function adminSessionCookieOptions() {
  const isDevelopment = process.env.NODE_ENV === "development"
  const secure = process.env.NODE_ENV === "production" || isDevelopment
  return {
    httpOnly: true,
    secure,
    sameSite: isDevelopment ? ("none" as const) : ("lax" as const),
    partitioned: isDevelopment,
    path: "/" as const,
    maxAge: ADMIN_SESSION_DURATION_SECONDS,
  }
}

export async function authenticateAdmin(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase()
  const [admin] = await db
    .select({ id: adminAccounts.id })
    .from(adminAccounts)
    .where(
      and(
        eq(adminAccounts.email, normalizedEmail),
        sql`${adminAccounts.passwordHash} = crypt(encode(digest(${password}, 'sha256'), 'hex'), ${adminAccounts.passwordHash})`,
      ),
    )
    .limit(1)

  return admin ?? null
}

export async function getAdminAccess() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value
  const adminId = token ? readAdminSessionToken(token) : null
  if (!adminId) return { user: null, authorized: false }

  const [user] = await db
    .select({ id: adminAccounts.id, email: adminAccounts.email })
    .from(adminAccounts)
    .where(eq(adminAccounts.id, adminId))
    .limit(1)

  return { user: user ?? null, authorized: Boolean(user) }
}

export async function getAdminUser() {
  const { authorized } = await getAdminAccess()
  return authorized
}

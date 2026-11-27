import { randomBytes, scrypt, createHmac, timingSafeEqual } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { cookies } from "next/headers"
import { db } from "@/lib/db"
import { deviceMaintainers, devices } from "@/lib/db/schema"

export const MAINTAINER_SESSION_COOKIE = "brewbot_maintainer_session"
const SESSION_DURATION_SECONDS = 60 * 60 * 12
const PASSWORD_HASH_BYTES = 64

function getSigningSecret() {
  const secret = process.env.MAINTAINER_SESSION_SECRET ?? process.env.BETTER_AUTH_SECRET
  if (!secret || secret.length < 32) throw new Error("A maintainer session signing secret of at least 32 characters is required.")
  return secret
}

function derivePasswordHash(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, PASSWORD_HASH_BYTES, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

export async function hashMaintainerPassword(password: string) {
  const salt = randomBytes(16)
  const hash = await derivePasswordHash(password, salt)
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`
}

export async function authenticateMaintainer(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase()
  const [maintainer] = await db
    .select({ deviceId: deviceMaintainers.deviceId, passwordHash: deviceMaintainers.passwordHash })
    .from(deviceMaintainers)
    .innerJoin(devices, eq(devices.deviceId, deviceMaintainers.deviceId))
    .where(and(eq(deviceMaintainers.email, normalizedEmail), eq(devices.isActive, true)))
    .limit(1)

  if (!maintainer) return null
  const [algorithm, saltValue, hashValue, ...extra] = maintainer.passwordHash.split("$")
  if (algorithm !== "scrypt" || !saltValue || !hashValue || extra.length) return null

  const salt = Buffer.from(saltValue, "base64url")
  const expected = Buffer.from(hashValue, "base64url")
  if (salt.length !== 16 || expected.length !== PASSWORD_HASH_BYTES) return null

  const provided = await derivePasswordHash(password, salt)
  return timingSafeEqual(provided, expected) ? maintainer.deviceId : null
}

function sign(payload: string) {
  return createHmac("sha256", getSigningSecret()).update(payload).digest("base64url")
}

export function createMaintainerSessionToken(deviceId: string) {
  const encodedDeviceId = Buffer.from(deviceId).toString("base64url")
  const expiresAt = Date.now() + SESSION_DURATION_SECONDS * 1000
  const payload = `${encodedDeviceId}.${expiresAt}`
  return `${payload}.${sign(payload)}`
}

function readMaintainerSession(token: string) {
  const [encodedDeviceId, expiresValue, signature, ...extra] = token.split(".")
  if (!encodedDeviceId || extra.length || !/^\d+$/.test(expiresValue ?? "")) return null
  const expiresAt = Number(expiresValue)
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return null

  const payload = `${encodedDeviceId}.${expiresValue}`
  const expected = Buffer.from(sign(payload), "base64url")
  const provided = Buffer.from(signature ?? "", "base64url")
  if (provided.length !== expected.length || !timingSafeEqual(expected, provided)) return null

  const deviceId = Buffer.from(encodedDeviceId, "base64url").toString("utf8")
  return /^[A-Z0-9_-]{1,64}$/.test(deviceId) ? deviceId : null
}

export function maintainerSessionCookieOptions() {
  const previewFrame = process.env.NODE_ENV === "development" && Boolean(process.env.V0_RUNTIME_URL)
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || previewFrame,
    sameSite: previewFrame ? ("none" as const) : ("lax" as const),
    path: "/" as const,
    maxAge: SESSION_DURATION_SECONDS,
  }
}

export async function getMaintainerAccess() {
  const token = (await cookies()).get(MAINTAINER_SESSION_COOKIE)?.value
  if (!token) return null

  let deviceId: string | null
  try {
    deviceId = readMaintainerSession(token)
  } catch {
    return null
  }
  if (!deviceId) return null

  const [activeDevice] = await db
    .select({ deviceId: devices.deviceId })
    .from(devices)
    .where(and(eq(devices.deviceId, deviceId), eq(devices.isActive, true)))
    .limit(1)

  return activeDevice?.deviceId ?? null
}

export async function getMaintainerUser() {
  return Boolean(await getMaintainerAccess())
}

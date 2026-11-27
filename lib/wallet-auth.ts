import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { db } from "@/lib/db"
import { walletAccounts } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export const WALLET_SESSION_COOKIE = "brewbot_wallet_session"
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7
const accountIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function sessionSecret() {
  const secret = process.env.ACCOUNT_SESSION_SECRET
    ?? process.env.BETTER_AUTH_SECRET
    ?? process.env.ADMIN_SESSION_SECRET
    ?? process.env.MAINTAINER_SESSION_SECRET
  if (!secret || secret.length < 32) throw new Error("A wallet session signing secret of at least 32 characters is required.")
  return secret
}

function sign(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url")
}

export function createWalletSessionToken(accountId: string) {
  const expiresAt = Date.now() + SESSION_DURATION_SECONDS * 1000
  const payload = `${accountId}.${expiresAt}`
  return `${payload}.${sign(payload)}`
}

function readWalletSessionToken(token: string) {
  const [accountId, expiresValue, signature, ...extra] = token.split(".")
  const expiresAt = Number(expiresValue)
  if (
    extra.length ||
    !accountIdPattern.test(accountId ?? "") ||
    !/^\d+$/.test(expiresValue ?? "") ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Date.now()
  ) return null

  const payload = `${accountId}.${expiresValue}`
  const expected = Buffer.from(sign(payload), "base64url")
  const provided = Buffer.from(signature ?? "", "base64url")
  return provided.length === expected.length && timingSafeEqual(expected, provided) ? accountId : null
}

export function walletSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/" as const,
    maxAge: SESSION_DURATION_SECONDS,
  }
}

export async function getWalletAccount() {
  const token = (await cookies()).get(WALLET_SESSION_COOKIE)?.value
  if (!token) return null

  let accountId: string | null
  try {
    accountId = readWalletSessionToken(token)
  } catch {
    return null
  }
  if (!accountId) return null

  const [account] = await db.select().from(walletAccounts).where(eq(walletAccounts.id, accountId)).limit(1)
  return account ?? null
}

export function serializeWalletAccount(account: {
  id: string
  userName: string
  studentId: string | null
  cardId: string
  walletBalancePaisa: number
}) {
  return {
    id: account.id,
    userName: account.userName,
    studentId: account.studentId,
    cardId: account.cardId,
    walletBalancePaisa: account.walletBalancePaisa,
  }
}

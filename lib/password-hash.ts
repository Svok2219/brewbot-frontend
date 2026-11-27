import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"

const HASH_BYTES = 64

function derivePasswordHash(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, HASH_BYTES, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const hash = await derivePasswordHash(password, salt)
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, saltValue, hashValue, ...extra] = storedHash.split("$")
  if (algorithm !== "scrypt" || !saltValue || !hashValue || extra.length) return false

  const salt = Buffer.from(saltValue, "base64url")
  const expected = Buffer.from(hashValue, "base64url")
  if (salt.length !== 16 || expected.length !== HASH_BYTES) return false

  const provided = await derivePasswordHash(password, salt)
  return timingSafeEqual(provided, expected)
}

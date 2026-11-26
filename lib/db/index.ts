import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

const globalForPostgres = globalThis as typeof globalThis & { postgresPool?: Pool }

function createPool() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
  })
  pool.on("error", (error) => {
    console.error("[database] Idle connection closed:", error.message)
  })
  return pool
}

export const pool = globalForPostgres.postgresPool ?? createPool()

if (process.env.NODE_ENV !== "production") {
  globalForPostgres.postgresPool = pool
}

export const db = drizzle(pool, { schema })

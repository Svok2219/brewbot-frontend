import type { NextRequest } from "next/server"

const configuredOriginVariables = [
  "VERCEL_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "V0_RUNTIME_URL",
  "V0_DEV_APP_URL",
  "V0_BUILD_URL",
  "V0_SANDBOX_URL",
]

function normalizeOrigin(value: string): string | null {
  try {
    const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`
    const url = new URL(candidate)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    return url.origin
  } catch {
    return null
  }
}

export function getPublicRequestOrigin(request: NextRequest) {
  const codespaceName = process.env.CODESPACE_NAME
  const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
  if (codespaceName && forwardingDomain) {
    const codespaceOrigin = normalizeOrigin(`${codespaceName}-3000.${forwardingDomain}`)
    if (codespaceOrigin) return codespaceOrigin
  }

  const browserOrigin = request.headers.get("origin")
  if (request.headers.get("sec-fetch-site") === "same-origin" && browserOrigin) {
    const normalized = normalizeOrigin(browserOrigin)
    if (normalized) return normalized
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
  const host = forwardedHost || request.headers.get("host")
  const protocol = forwardedProtocol || request.nextUrl.protocol.replace(":", "")
  if (host && (protocol === "http" || protocol === "https")) {
    const forwardedOrigin = normalizeOrigin(`${protocol}://${host}`)
    if (forwardedOrigin) return forwardedOrigin
  }

  return request.nextUrl.origin
}

export function isSameOriginRequest(request: NextRequest) {
  const origin = normalizeOrigin(request.headers.get("origin") ?? "")
  if (!origin) return false

  // The preview proxy may rewrite Host; Fetch Metadata still reflects the browser's actual request origin.
  if (request.headers.get("sec-fetch-site") === "same-origin") return true

  const allowedOrigins = new Set<string>()
  const hosts = [
    ...(request.headers.get("x-forwarded-host")?.split(",") ?? []),
    request.headers.get("host") ?? "",
    request.nextUrl.host,
  ].map((host) => host.trim()).filter(Boolean)
  const protocols = [
    ...(request.headers.get("x-forwarded-proto")?.split(",") ?? []),
    request.nextUrl.protocol.replace(":", ""),
  ].map((protocol) => protocol.trim().toLowerCase()).filter((protocol) => protocol === "http" || protocol === "https")

  for (const host of hosts) {
    for (const protocol of protocols) {
      const allowed = normalizeOrigin(`${protocol}://${host}`)
      if (allowed) allowedOrigins.add(allowed)
    }
  }

  for (const variable of configuredOriginVariables) {
    const value = process.env[variable]
    if (!value) continue
    const allowed = normalizeOrigin(value)
    if (allowed) allowedOrigins.add(allowed)
  }

  return allowedOrigins.has(origin)
}

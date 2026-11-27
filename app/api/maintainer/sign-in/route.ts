import { NextRequest, NextResponse } from "next/server"
import { authenticateMaintainer, createMaintainerSessionToken, MAINTAINER_SESSION_COOKIE, maintainerSessionCookieOptions } from "@/lib/maintainer-auth"
import { isSameOriginRequest } from "@/lib/request-origin"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 })
  const body: unknown = await request.json().catch(() => null)
  const email = typeof body === "object" && body !== null && !Array.isArray(body) && "email" in body && typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const password = typeof body === "object" && body !== null && !Array.isArray(body) && "password" in body && typeof body.password === "string" ? body.password : ""
  if (!email || email.length > 254 || !email.includes("@") || !password || password.length > 1024) {
    return NextResponse.json({ error: "Enter your maintainer email and password." }, { status: 400 })
  }

  try {
    const deviceId = await authenticateMaintainer(email, password)
    if (!deviceId) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 })
    const response = NextResponse.json({ success: true })
    response.cookies.set(MAINTAINER_SESSION_COOKIE, createMaintainerSessionToken(deviceId), maintainerSessionCookieOptions())
    return response
  } catch {
    return NextResponse.json({ error: "Maintainer sign-in is unavailable. Try again or ask the owner to check the device account." }, { status: 503 })
  }
}

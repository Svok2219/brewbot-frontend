import { NextRequest, NextResponse } from "next/server"
import { isSameOriginRequest } from "@/lib/request-origin"
import { WALLET_SESSION_COOKIE, walletSessionCookieOptions } from "@/lib/wallet-auth"

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 })
  const response = NextResponse.json({ signedOut: true })
  response.cookies.set(WALLET_SESSION_COOKIE, "", { ...walletSessionCookieOptions(), maxAge: 0 })
  return response
}

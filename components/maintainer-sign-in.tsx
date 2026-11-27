"use client"

import { useState, type FormEvent } from "react"
import { BrewBotLogo } from "@/components/brewbot-logo"

export function MaintainerSignIn() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setMessage("")

    try {
      const form = new FormData(event.currentTarget)
      const email = String(form.get("email") ?? "").trim().toLowerCase()
      const password = String(form.get("password") ?? "")
      const response = await fetch("/api/maintainer/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        setMessage(payload.error || "Email or password is incorrect.")
        return
      }
      window.location.assign("/admin/maintainer")
    } catch {
      setMessage("Sign-in is temporarily unavailable. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="admin-auth-page">
      <section className="admin-auth-card" aria-labelledby="maintainer-signin-title">
        <BrewBotLogo className="admin-auth-logo" />
        <p className="ops-eyebrow">DEVICE MAINTAINER</p>
        <h1 id="maintainer-signin-title">Sign in to manage RFID access</h1>
        <p className="admin-auth-description">Use the email and password assigned to your device by the owner.</p>
        {message && <p className="admin-auth-message" role="alert">{message}</p>}
        <form className="admin-auth-form" onSubmit={submit}>
          <label htmlFor="maintainer-email">Email</label>
          <input id="maintainer-email" name="email" type="email" autoComplete="username" required />
          <label htmlFor="maintainer-password">Password</label>
          <input id="maintainer-password" name="password" type="password" autoComplete="current-password" maxLength={1024} required />
          <button className="ops-button-primary" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  )
}

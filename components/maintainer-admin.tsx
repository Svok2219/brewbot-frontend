"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import useSWR from "swr"
import { ArrowLeft, ArrowRight, LogOut, Radio, ShieldCheck, Store, UserRoundPlus, X } from "lucide-react"
import { BrewBotLogo } from "@/components/brewbot-logo"
import { DEFAULT_DEVICE_ID, DEFAULT_DEVICE_PATH } from "@/lib/device-routes"

type RfidMember = { id: string; userName: string; cardId: string; walletBalancePaisa: number }
type UsersResponse = { users?: RfidMember[]; error?: string }

const fetchUsers = async (url: string): Promise<UsersResponse> => {
  const response = await fetch(url, { cache: "no-store" })
  const payload = await response.json() as UsersResponse
  if (!response.ok) throw new Error(payload.error || "RFID users could not be loaded.")
  return payload
}
const formatBalance = (paisa: number) => `৳${(paisa / 100).toLocaleString("en-BD", { minimumFractionDigits: 2 })}`

export function MaintainerAdmin() {
  const usersUrl = `/api/admin/rfid-users?deviceId=${encodeURIComponent(DEFAULT_DEVICE_ID)}`
  const { data, error, isLoading, mutate } = useSWR(usersUrl, fetchUsers, { revalidateOnFocus: true })
  const members = data?.users ?? []
  const [userName, setUserName] = useState("")
  const [cardId, setCardId] = useState("")
  const [pendingCancel, setPendingCancel] = useState<string | null>(null)
  const [feedback, setFeedback] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function signOut() {
    setIsSigningOut(true)
    try {
      const response = await fetch("/api/maintainer/sign-out", { method: "POST" })
      if (!response.ok) throw new Error("Could not sign out. Please try again.")
      window.location.assign("/admin/maintainer/sign-in")
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Could not sign out. Please try again.")
      setIsSigningOut(false)
    }
  }

  async function registerMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback("")
    setIsSaving(true)
    try {
      const response = await fetch("/api/admin/rfid-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: DEFAULT_DEVICE_ID, userName, cardId }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error || "RFID registration failed.")
      setUserName("")
      setCardId("")
      setFeedback("RFID user registered and saved.")
      await mutate()
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "RFID registration could not be saved.")
    } finally {
      setIsSaving(false)
    }
  }

  async function cancelRegistration(member: RfidMember) {
    setFeedback("")
    setIsSaving(true)
    try {
      const query = new URLSearchParams({ id: member.id, deviceId: DEFAULT_DEVICE_ID })
      const response = await fetch(`/api/admin/rfid-users?${query}`, { method: "DELETE" })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error || "RFID access could not be removed.")
      setPendingCancel(null)
      setFeedback(`RFID access for ${member.userName} was deactivated. Its history and wallet balance remain preserved.`)
      await mutate()
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "RFID access could not be removed.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="ops-shell ops-maintainer-shell">
      <aside className="ops-sidebar">
        <Link className="ops-brand" href={DEFAULT_DEVICE_PATH} aria-label="BrewBot storefront"><BrewBotLogo /></Link>
        <div className="ops-workspace">
          <span className="ops-workspace-mark"><Store aria-hidden="true" /></span>
          <span><strong>Jagannath Hall</strong><small>Device workspace</small></span>
        </div>
        <div className="ops-maintainer-label"><ShieldCheck aria-hidden="true" /><span>DEVICE MAINTAINER</span></div>
        <div className="ops-sidebar-bottom">
          <Link className="ops-role-link" href="/admin">
            <span><strong>Owner workspace</strong><small>Orders, menu &amp; ads</small></span>
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </aside>

      <section className="ops-main">
        <header className="ops-topbar">
          <div className="ops-breadcrumb"><span>Device maintainer</span><b aria-hidden="true">/</b>RFID users</div>
          <div className="ops-top-actions">
            <Link className="ops-role-switch" href="/admin" aria-label="Switch to owner workspace"><ArrowLeft aria-hidden="true" /><span>Owner</span></Link>
            <button className="ops-role-switch" type="button" onClick={signOut} disabled={isSigningOut} aria-label="Sign out of maintainer tools"><LogOut aria-hidden="true" /><span>{isSigningOut ? "Signing out…" : "Sign out"}</span></button>
          </div>
        </header>
        <div className="ops-content">
          <div className="ops-page-heading">
            <div>
              <p className="ops-eyebrow">DEVICE {DEFAULT_DEVICE_ID}</p>
              <h1>Device maintainer</h1>
              <p>Check your assigned kiosk and manage RFID access.</p>
            </div>
            <Link className="ops-storefront-link" href="/admin"><ArrowLeft aria-hidden="true" /> Owner workspace</Link>
          </div>

          <div className="ops-preview-note" role="note">
            <span className="ops-note-dot" aria-hidden="true" />
            RFID changes are saved to the active users table. Deactivated users keep their wallet history.
          </div>
          {feedback && <p className="ops-feedback" role="status">{feedback}</p>}
          {error && <p className="ops-feedback" role="alert">{error.message}</p>}

          <section className="ops-card ops-maintainer-device" aria-labelledby="maintainer-device-heading">
            <div className="ops-card-heading">
              <div><p className="ops-eyebrow">DEVICE SUMMARY</p><h2 id="maintainer-device-heading">Jagannath Hall kiosk</h2></div>
              <span className="ops-status">{isLoading ? "Loading users" : "Device active"}</span>
            </div>
            <div className="ops-device-details">
              <span className="ops-device-icon"><Radio aria-hidden="true" /></span>
              <div><strong>University of Dhaka</strong><span>Main entrance · RFID access management</span></div>
              <code>{DEFAULT_DEVICE_ID}</code>
            </div>
          </section>

          <div className="ops-maintainer-grid">
            <section className="ops-card ops-rfid-form-card" aria-labelledby="rfid-register-heading">
              <div className="ops-card-heading">
                <div><p className="ops-eyebrow">RFID ACCESS</p><h2 id="rfid-register-heading">Register a user</h2><p>Names can repeat; each RFID card must be unique for this device.</p></div>
                <span className="ops-form-icon"><UserRoundPlus aria-hidden="true" /></span>
              </div>
              <form className="ops-rfid-form" onSubmit={registerMember}>
                <label htmlFor="user-name">User name</label>
                <input id="user-name" value={userName} onChange={(event) => setUserName(event.target.value)} placeholder="Enter the cardholder’s name" autoComplete="name" required />
                <label htmlFor="rfid-card-id">RFID card number</label>
                <input id="rfid-card-id" value={cardId} onChange={(event) => setCardId(event.target.value)} placeholder="Scan or enter card number" autoComplete="off" required />
                <button className="ops-button-primary" type="submit" disabled={isSaving}><UserRoundPlus aria-hidden="true" /> {isSaving ? "Saving…" : "Register RFID user"}</button>
              </form>
            </section>

            <section className="ops-card ops-members-card" aria-labelledby="registered-users-heading">
              <div className="ops-card-heading">
                <div><p className="ops-eyebrow">CURRENT DEVICE</p><h2 id="registered-users-heading">Registered RFID users</h2></div>
                <span className="ops-record-count">{String(members.length).padStart(2, "0")} users</span>
              </div>
              <div className="ops-member-list" aria-live="polite">
                {isLoading ? <p className="ops-empty">Loading registered RFID users…</p> : members.length === 0 ? <p className="ops-empty">No active RFID users are registered for this device.</p> : members.map((member) => (
                  <article className="ops-member-row" key={member.id}>
                    <span className="ops-member-avatar" aria-hidden="true">{member.userName.slice(-2).toUpperCase()}</span>
                    <div className="ops-member-copy"><strong>{member.userName}</strong><span>Card · {member.cardId} · Balance {formatBalance(member.walletBalancePaisa)}</span></div>
                    {pendingCancel === member.id ? (
                      <div className="ops-cancel-confirm" role="group" aria-label={`Confirm deactivation for ${member.userName}`}>
                        <button className="ops-cancel-confirm-button" type="button" disabled={isSaving} onClick={() => cancelRegistration(member)}>Confirm</button>
                        <button className="ops-icon-action" type="button" onClick={() => setPendingCancel(null)} aria-label="Keep RFID access"><X aria-hidden="true" /></button>
                      </div>
                    ) : (
                      <button className="ops-cancel-button" type="button" disabled={isSaving} onClick={() => setPendingCancel(member.id)}>Deactivate</button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </div>
          <p className="ops-page-footnote">Deactivating a card preserves its balance and history and makes the card eligible for reassignment.</p>
        </div>
      </section>
    </main>
  )
}

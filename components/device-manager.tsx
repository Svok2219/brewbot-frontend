"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import useSWR from "swr"
import { ArrowUpRight, Radio, Store } from "lucide-react"

type Device = {
  deviceId: string
  universityName: string
  locationName: string
  isActive: boolean
  maintainerName: string | null
  maintainerContact: string | null
  maintainerEmail: string | null
}
type DevicesResponse = { devices?: Device[]; error?: string }

async function fetchDevices(url: string): Promise<DevicesResponse> {
  const response = await fetch(url, { cache: "no-store" })
  const result = await response.json() as DevicesResponse
  if (!response.ok) throw new Error(result.error || "Devices could not be loaded.")
  return result
}

async function responseError(response: Response) {
  const result = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(result.error || "The device request failed.")
  return result
}

export function DeviceManager() {
  const { data, error, isLoading, mutate } = useSWR<DevicesResponse>("/api/admin/devices", fetchDevices, {
    revalidateOnFocus: true,
  })
  const [universityName, setUniversityName] = useState("")
  const [locationName, setLocationName] = useState("")
  const [maintainerName, setMaintainerName] = useState("")
  const [maintainerContact, setMaintainerContact] = useState("")
  const [maintainerEmail, setMaintainerEmail] = useState("")
  const [maintainerPassword, setMaintainerPassword] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [feedback, setFeedback] = useState("")
  const devices = data?.devices ?? []

  async function createDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isCreating) return
    setIsCreating(true)
    setFeedback("")
    try {
      const response = await fetch("/api/admin/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          universityName,
          locationName,
          maintainerName,
          maintainerContact,
          maintainerEmail,
          maintainerPassword,
        }),
      })
      const result = await responseError(response) as { device?: Device }
      if (!result.device) throw new Error("The new device was not returned.")
      setUniversityName("")
      setLocationName("")
      setMaintainerName("")
      setMaintainerContact("")
      setMaintainerEmail("")
      setMaintainerPassword("")
      setFeedback(`Device created: ${result.device.deviceId}`)
      await mutate()
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "The device could not be created.")
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="ops-device-manager">
      <section className="ops-card" aria-labelledby="create-device-heading">
        <div className="ops-card-heading">
          <div>
            <p className="ops-eyebrow">DEVICE REGISTRY</p>
            <h2 id="create-device-heading">Add a new device</h2>
            <p>A device ID is generated automatically and used for its storefront route.</p>
          </div>
          <span className="ops-form-icon"><Radio aria-hidden="true" /></span>
        </div>
        <form className="ops-device-form" onSubmit={createDevice}>
          <label htmlFor="device-campus">Campus name</label>
          <input id="device-campus" value={universityName} onChange={(event) => setUniversityName(event.target.value)} maxLength={160} autoComplete="organization" required />
          <label htmlFor="device-location">Location name</label>
          <input id="device-location" value={locationName} onChange={(event) => setLocationName(event.target.value)} maxLength={160} required />
          <label htmlFor="new-maintainer-name">Maintainer name</label>
          <input id="new-maintainer-name" value={maintainerName} onChange={(event) => setMaintainerName(event.target.value)} maxLength={120} autoComplete="name" required />
          <label htmlFor="new-maintainer-contact">Maintainer mobile number</label>
          <input id="new-maintainer-contact" type="tel" value={maintainerContact} onChange={(event) => setMaintainerContact(event.target.value)} maxLength={32} autoComplete="tel" placeholder="+880 1XXX-XXXXXX" required />
          <label htmlFor="new-maintainer-email">Maintainer email</label>
          <input id="new-maintainer-email" type="email" value={maintainerEmail} onChange={(event) => setMaintainerEmail(event.target.value)} maxLength={254} autoComplete="email" required />
          <label htmlFor="new-maintainer-password">Maintainer password</label>
          <input id="new-maintainer-password" type="password" value={maintainerPassword} onChange={(event) => setMaintainerPassword(event.target.value)} minLength={12} maxLength={1024} autoComplete="new-password" required />
          <p className="ops-form-hint">Use a unique password with at least 12 characters. Passwords are stored as salted hashes.</p>
          <button className="ops-button-primary" type="submit" disabled={isCreating}>
            {isCreating ? "Creating device…" : "Create device"}
          </button>
        </form>
      </section>

      {feedback && <p className="ops-feedback" role="status">{feedback}</p>}
      {error && <p className="ops-error" role="alert">{error.message}</p>}

      <section className="ops-card" aria-labelledby="registered-devices-heading">
        <div className="ops-card-heading">
          <div><p className="ops-eyebrow">REGISTERED KIOSKS</p><h2 id="registered-devices-heading">Devices</h2></div>
          <span className="ops-record-count">{isLoading ? "Loading…" : `${devices.length} devices`}</span>
        </div>
        {isLoading ? <p className="ops-empty">Loading registered devices…</p> : devices.length === 0 ? (
          <p className="ops-empty">No devices are registered yet.</p>
        ) : (
          <div className="ops-device-list">
            {devices.map((device) => (
              <article className="ops-device-entry" key={device.deviceId}>
                <div className="ops-device-entry-heading">
                  <span className="ops-device-icon"><Store aria-hidden="true" /></span>
                  <div><strong>{device.locationName}</strong><span>{device.universityName}</span></div>
                  <code>{device.deviceId}</code>
                  <Link className="ops-text-button" href={`/${encodeURIComponent(device.deviceId)}`} target="_blank" rel="noreferrer">
                    Storefront <ArrowUpRight aria-hidden="true" />
                  </Link>
                </div>
                <DeviceMaintainerForm device={device} onSaved={mutate} />
              </article>
            ))}
          </div>
        )}
      </section>
      <p className="ops-page-footnote">Product and advertisement settings are shared by all registered devices.</p>
    </div>
  )
}

function DeviceMaintainerForm({ device, onSaved }: { device: Device; onSaved: () => Promise<unknown> }) {
  const [name, setName] = useState(device.maintainerName ?? "")
  const [contact, setContact] = useState(device.maintainerContact ?? "")
  const [email, setEmail] = useState(device.maintainerEmail ?? "")
  const [password, setPassword] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState("")

  async function saveMaintainer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return
    setIsSaving(true)
    setFeedback("")
    try {
      const response = await fetch("/api/admin/devices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: device.deviceId,
          maintainerName: name,
          maintainerContact: contact,
          maintainerEmail: email,
          maintainerPassword: password,
        }),
      })
      await responseError(response)
      setPassword("")
      setFeedback("Maintainer account saved.")
      await onSaved()
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Maintainer details could not be saved.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="ops-device-maintainer-form" onSubmit={saveMaintainer}>
      <div>
        <strong>{device.maintainerEmail ? `${device.maintainerName ?? "Maintainer"} · ${device.maintainerEmail}` : "No maintainer account assigned"}</strong>
        <span>Assign or reset this device’s maintainer login.</span>
      </div>
      <label className="ops-visually-hidden" htmlFor={`maintainer-name-${device.deviceId}`}>Maintainer name</label>
      <input id={`maintainer-name-${device.deviceId}`} type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoComplete="name" placeholder="Maintainer name" required />
      <label className="ops-visually-hidden" htmlFor={`maintainer-contact-${device.deviceId}`}>Maintainer mobile number</label>
      <input id={`maintainer-contact-${device.deviceId}`} type="tel" value={contact} onChange={(event) => setContact(event.target.value)} maxLength={32} autoComplete="tel" placeholder="Mobile number" required />
      <label className="ops-visually-hidden" htmlFor={`maintainer-email-${device.deviceId}`}>Maintainer email</label>
      <input id={`maintainer-email-${device.deviceId}`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="off" placeholder="Maintainer email" required />
      <label className="ops-visually-hidden" htmlFor={`maintainer-password-${device.deviceId}`}>New maintainer password</label>
      <input id={`maintainer-password-${device.deviceId}`} type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={1024} autoComplete="new-password" placeholder="New password (12+ characters)" required />
      <button className="ops-button-secondary" type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save maintainer"}</button>
      {feedback && <span className="ops-device-form-feedback" role="status">{feedback}</span>}
    </form>
  )
}

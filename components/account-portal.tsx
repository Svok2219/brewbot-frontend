"use client"

import Link from "next/link"
import { type FormEvent, useState } from "react"
import useSWR from "swr"
import { ArrowLeft, ArrowRight, CheckCircle2, CircleAlert, LogOut, WalletCards } from "lucide-react"
import { BrewBotLogo } from "@/components/brewbot-logo"

type WalletAccount = {
  id: string
  userName: string
  studentId: string | null
  cardId: string
  walletBalancePaisa: number
}

type AccountResponse = { account?: WalletAccount; error?: string }
type TopupResponse = { status?: string; walletBalancePaisa?: number; error?: string }
type Props = { deviceId?: string; resultToken?: string }

const topupOptions = [10_000, 20_000, 50_000, 100_000]
const taka = (paisa: number) => `৳${(paisa / 100).toLocaleString("en-BD", { minimumFractionDigits: 2 })}`

async function fetchAccount(url: string): Promise<AccountResponse> {
  const response = await fetch(url, { cache: "no-store" })
  if (response.status === 401) return {}
  const payload = await response.json() as AccountResponse
  if (!response.ok) throw new Error(payload.error ?? "Account could not be loaded.")
  return payload
}

async function fetchTopup(url: string): Promise<TopupResponse> {
  const response = await fetch(url, { cache: "no-store" })
  const payload = await response.json() as TopupResponse
  if (!response.ok) throw new Error(payload.error ?? "Payment status could not be loaded.")
  return payload
}

export function AccountPortal({ deviceId, resultToken }: Props) {
  const { data, error, mutate } = useSWR<AccountResponse>("/api/account", fetchAccount, {
    revalidateOnFocus: true,
  })
  const topupUrl = resultToken ? `/api/account/topup?resultToken=${encodeURIComponent(resultToken)}` : null
  const { data: topup, error: topupError, mutate: mutateTopup } = useSWR<TopupResponse>(topupUrl, fetchTopup, {
    refreshInterval: (latest) => latest?.status === "pending" ? 2500 : 0,
    revalidateOnFocus: true,
  })
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in")
  const [userName, setUserName] = useState("")
  const [studentId, setStudentId] = useState("")
  const [cardHex, setCardHex] = useState("")
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [feedback, setFeedback] = useState("")
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState(topupOptions[0])

  const account = data?.account
  const backHref = deviceId ? `/${encodeURIComponent(deviceId)}` : "/"
  const displayedBalance = topup?.walletBalancePaisa ?? account?.walletBalancePaisa

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (mode === "create" && password !== confirmPassword) {
      setFeedback("The passwords do not match.")
      return
    }

    setBusy(true)
    setFeedback("")
    try {
      const creating = mode === "create"
      const response = await fetch(creating ? "/api/account" : "/api/account/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creating
          ? { userName, studentId, cardHex, password, deviceId }
          : { identifier, password, deviceId }),
      })
      const payload = await response.json() as AccountResponse
      if (!response.ok || !payload.account) throw new Error(payload.error ?? "Account could not be saved.")
      await mutate(payload, false)
      setFeedback(creating ? "Account ready. Your wallet is shared across BrewBot devices." : "")
      setPassword("")
      setConfirmPassword("")
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Account could not be saved.")
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    setBusy(true)
    try {
      const response = await fetch("/api/account/sign-out", { method: "POST" })
      if (!response.ok) throw new Error("Sign-out failed. Please try again.")
      await mutate({}, false)
      setFeedback("You have signed out.")
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Sign-out failed. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  async function startTopup() {
    setBusy(true)
    setFeedback("")
    try {
      const response = await fetch("/api/payments/eps/wallet-initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountPaisa: amount, idempotencyKey: crypto.randomUUID() }),
      })
      const payload = await response.json() as { redirectUrl?: string; error?: string }
      if (!response.ok || !payload.redirectUrl) throw new Error(payload.error ?? "Top-up could not be started.")
      window.location.assign(payload.redirectUrl)
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Top-up could not be started.")
      setBusy(false)
    }
  }

  return (
    <main className="recharge-page">
      <header className="recharge-header">
        <Link className="recharge-back" href={backHref} aria-label="Back to BrewBot"><ArrowLeft aria-hidden="true" /></Link>
        <BrewBotLogo />
        <span className="recharge-header-label">BREWBOT ACCOUNT</span>
      </header>

      <div className="recharge-content">
        <div className="recharge-intro">
          <span className="recharge-icon"><WalletCards aria-hidden="true" /></span>
          <p className="recharge-eyebrow">ONE ACCOUNT · EVERY DEVICE</p>
          <h1>Your BrewBot wallet</h1>
          <p>Sign in with your student ID or RFID card HEX. Your balance works across BrewBot devices.</p>
        </div>

        {error && <div className="recharge-inline-status" role="alert"><CircleAlert aria-hidden="true" /><p><strong>Account unavailable.</strong><span>{error.message}</span></p></div>}
        {topup && (
          <div className={`recharge-inline-status ${topup.status === "paid" ? "recharge-inline-status-success" : ""}`} role="status" aria-live="polite">
            {topup.status === "paid" ? <CheckCircle2 aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
            <p><strong>{topup.status === "paid" ? "Top-up confirmed." : topup.status === "pending" ? "Confirming your payment…" : `Payment ${topup.status ?? "status unavailable"}.`}</strong>
              <span>{topup.walletBalancePaisa !== undefined ? `Wallet balance: ${taka(topup.walletBalancePaisa)}.` : "Your wallet updates after EPS confirms the payment."}</span></p>
          </div>
        )}
        {topupError && <p className="recharge-inline-status" role="alert">{topupError.message}</p>}

        {account ? (
          <section className="recharge-card" aria-labelledby="wallet-account-heading">
            <div className="recharge-section-heading">
              <span className="recharge-step">01</span>
              <div><h2 id="wallet-account-heading">Welcome, {account.userName}</h2><p>{account.studentId ? `Student ID · ${account.studentId}` : `RFID card · ${account.cardId}`}</p></div>
              <button className="recharge-text-button" type="button" onClick={signOut} disabled={busy}><LogOut aria-hidden="true" /> Sign out</button>
            </div>
            <div className="recharge-inline-status recharge-inline-status-success" role="status">
              <WalletCards aria-hidden="true" />
              <p><strong>Wallet balance</strong><span>{taka(displayedBalance ?? 0)} · usable at every BrewBot device</span></p>
            </div>
            <section className="recharge-card recharge-payment-card" aria-labelledby="topup-heading">
              <div className="recharge-section-heading"><span className="recharge-step">02</span><div><h2 id="topup-heading">Add wallet balance</h2><p>Choose an amount to pay securely through EPS.</p></div></div>
              <div className="recharge-amount-options" role="group" aria-label="Top-up amount">
                {topupOptions.map((option) => (
                  <button key={option} className={`recharge-amount-option ${amount === option ? "is-selected" : ""}`} type="button" aria-pressed={amount === option} onClick={() => setAmount(option)}>{taka(option)}</button>
                ))}
              </div>
              <button className="recharge-primary-button" type="button" onClick={startTopup} disabled={busy}>
                {busy ? "Opening EPS…" : `Continue to EPS · ${taka(amount)}`} <ArrowRight aria-hidden="true" />
              </button>
            </section>
          </section>
        ) : (
          <section className="recharge-card" aria-labelledby="account-auth-heading">
            <div className="recharge-section-heading">
              <span className="recharge-step">01</span>
              <div><h2 id="account-auth-heading">{mode === "create" ? "Create your account" : "Sign in"}</h2><p>{mode === "create" ? "Set a password for your universal BrewBot wallet." : "Use your student ID or card HEX and password."}</p></div>
            </div>
            <form className="recharge-lookup-form" onSubmit={submitAccount}>
              {mode === "create" ? (
                <>
                  <label htmlFor="account-name">Your name</label>
                  <input id="account-name" value={userName} onChange={(event) => setUserName(event.target.value)} autoComplete="name" required />
                  <label htmlFor="account-student-id">Student ID (optional)</label>
                  <input id="account-student-id" value={studentId} onChange={(event) => setStudentId(event.target.value)} autoComplete="username" />
                  <label htmlFor="account-card-hex">RFID card HEX</label>
                  <input id="account-card-hex" value={cardHex} onChange={(event) => setCardHex(event.target.value)} autoComplete="off" placeholder="For new accounts, enter the HEX printed on your card" />
                  <p className="recharge-hint">Existing card accounts can be claimed with the linked student ID or card HEX. New accounts need a card HEX.</p>
                </>
              ) : (
                <>
                  <label htmlFor="account-identifier">Student ID or card HEX</label>
                  <input id="account-identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required />
                </>
              )}
              <label htmlFor="account-password">Password</label>
              <input id="account-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "create" ? "new-password" : "current-password"} minLength={mode === "create" ? 12 : undefined} required />
              {mode === "create" && (
                <>
                  <label htmlFor="account-confirm-password">Confirm password</label>
                  <input id="account-confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={12} required />
                </>
              )}
              <button className="recharge-primary-button" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "create" ? "Create account" : "Sign in"} <ArrowRight aria-hidden="true" /></button>
            </form>
            {feedback && <div className="recharge-inline-status" role="status"><CircleAlert aria-hidden="true" /><p><span>{feedback}</span></p></div>}
            <button className="recharge-text-button recharge-register-link" type="button" onClick={() => { setMode(mode === "create" ? "sign-in" : "create"); setFeedback("") }}>
              {mode === "create" ? "Already have an account? Sign in" : "New to BrewBot? Create an account"}
            </button>
          </section>
        )}
        {account && feedback && <p className="recharge-inline-status" role="status">{feedback}</p>}
      </div>
    </main>
  )
}

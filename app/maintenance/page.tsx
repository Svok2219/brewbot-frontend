import Link from "next/link"
import { Coffee, Wrench } from "lucide-react"
import { BrewBotLogo } from "@/components/brewbot-logo"
import { DEFAULT_DEVICE_PATH } from "@/lib/device-routes"

export default function MaintenancePage() {
  return <main className="maintenance-page"><header className="site-header"><Link className="brand" href={DEFAULT_DEVICE_PATH} aria-label="BrewBot home"><BrewBotLogo /></Link><span className="maintenance-status"><i/> TEMPORARILY OFFLINE</span></header><section className="maintenance-content"><div className="maintenance-illustration"><div className="maintenance-circle"><Coffee size={47}/></div><span className="tool-bubble"><Wrench size={20}/></span></div><p className="eyebrow">A QUICK BREW BREAK</p><h1>We&apos;ll be right<br/>back.</h1><p className="maintenance-copy">BrewBot is taking a moment to make things better. Our team is working on it, and your next cup will be ready soon.</p><div className="maintenance-note"><span className="maintenance-note-dot"/><span><b>Jagannath Hall kiosk</b><small>We&apos;re working to restore service</small></span></div><Link href={DEFAULT_DEVICE_PATH} className="maintenance-home">Try again <span>→</span></Link><span className="maintenance-foot">Thanks for your patience · BrewBot</span></section></main>
}

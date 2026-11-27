import Image from "next/image"

type BrewBotLogoProps = {
  className?: string
}

export function BrewBotLogo({ className = "" }: BrewBotLogoProps) {
  return (
    <span className={`brewbot-logo ${className}`.trim()}>
      <Image className="brewbot-logo-image" src="/brewbot-logo.png" alt="BrewBot" width={1292} height={421} priority />
    </span>
  )
}

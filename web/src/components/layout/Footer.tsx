'use client'

interface FooterProps {
  onPrivacyClick?: () => void
}

export function Footer({ onPrivacyClick }: FooterProps) {
  return (
    <footer className="py-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
      <span>edelweiss0297.cloud</span>
      {' · '}
      <span>Proxmox &amp; Cloudflare</span>
      {' · '}
      <button
        type="button"
        onClick={onPrivacyClick}
        className="underline underline-offset-2 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
      >
        개인정보 처리방침
      </button>
    </footer>
  )
}

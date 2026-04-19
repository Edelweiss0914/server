import { redirect } from 'next/navigation'

const PANEL_URL =
  process.env.PTERODACTYL_PANEL_URL ?? 'https://panel.edelweiss0297.cloud'

export default function PanelAccessPage() {
  redirect(PANEL_URL)
}

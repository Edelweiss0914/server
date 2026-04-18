import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'CHEEZE — On-Demand 서버',
}

export default function ServersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}

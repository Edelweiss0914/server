import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'CHEEZE — E-Class 자동화',
}

export default function LmsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="min-h-screen bg-gray-900 text-white">
      <div className="mx-auto max-w-[960px] px-4 py-10 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 transition-colors mb-6"
        >
          &larr; 메인으로
        </Link>
        {children}
      </div>
    </main>
  )
}

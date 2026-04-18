import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'CHEEZE — 관리자',
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-[920px] px-4 py-10 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors mb-6"
        >
          &larr; 메인으로
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-8">
          관리자
        </h1>
        {children}
      </div>
    </main>
  )
}

import Link from 'next/link'
import { ServersGrid } from '@/components/servers/ServersGrid'

export default function ServersPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors mb-6"
        >
          &larr; 메인으로
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-1">
          On-Demand 서버
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mb-8">
          필요할 때만 켜지는 게임 서버
        </p>
        <ServersGrid />
      </div>
    </main>
  )
}

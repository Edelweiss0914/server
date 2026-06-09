import Link from 'next/link'
import { ServersGrid } from '@/components/servers/ServersGrid'
import { RentalRequestButton } from '@/components/servers/RentalRequestButton'

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
        <div className="flex items-start justify-between gap-4 mb-1">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            On-Demand 서버
          </h1>
          <RentalRequestButton />
        </div>
        <p className="text-zinc-500 dark:text-zinc-400 mb-8">
          필요할 때만 켜지는 게임 서버
        </p>
        <ServersGrid />

        <div className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">서버 대여</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                추가 서버가 필요하면 대여 신청을 통해 요청할 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

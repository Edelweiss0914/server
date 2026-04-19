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
        <section className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
          현재는 기존 서버 가동 방식을 유지합니다. Phase 3 동안 Pterodactyl은 신규 서버부터 순차 적용하며,
          이 페이지의 기존 시작·종료 기능은 안정화 전까지 그대로 운영합니다.
        </section>
        <ServersGrid />
      </div>
    </main>
  )
}

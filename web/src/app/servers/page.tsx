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

        <div className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">임대인 전용</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                서버 관리 패널에 접속하려면 인증이 필요합니다.
              </p>
            </div>
            <a
              href="/panel-access"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 110-2h4a1 1 0 011 1v4a1 1 0 11-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 112 0v1.586l2.293-2.293a1 1 0 011.414 1.414L6.414 15H8a1 1 0 110 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 110-2h1.586l-2.293-2.293a1 1 0 011.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              패널 접속
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}

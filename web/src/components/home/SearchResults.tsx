'use client'

import type { Service } from '@/lib/services'

interface SearchResultsProps {
  results: Service[]
  query: string
}

function ResultCard({ service }: { service: Service }) {
  const urlDisplay = service.url.replace(/^https?:\/\//, '')
  const isInternal = service.url.startsWith('/')
  const linkProps = isInternal
    ? {}
    : { target: '_blank' as const, rel: 'noopener noreferrer' }

  return (
    <a
      href={service.url}
      className="group flex items-start gap-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 p-4 shadow-sm hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-600 transition-all"
      {...linkProps}
    >
      <div
        className="flex items-center justify-center rounded-xl shrink-0"
        style={{
          width: 44,
          height: 44,
          backgroundColor: service.bgColor || `${service.color}20`,
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{ width: 26, height: 26 }}
          dangerouslySetInnerHTML={{ __html: service.icon }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-50">
            {service.name}
          </span>
          {service.nameKo && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {service.nameKo}
            </span>
          )}
          {service.categoryIcon && (
            <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
              {service.categoryIcon} {service.category}
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
          {service.description}
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
          {urlDisplay}
        </p>
      </div>
      <div className="shrink-0 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors mt-1">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </div>
    </a>
  )
}

export function SearchResults({ results, query }: SearchResultsProps) {
  if (!query.trim()) return null

  if (!results.length) {
    return (
      <section aria-label="검색 결과" aria-live="polite">
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-lg text-zinc-400">
            ?
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            &ldquo;{query}&rdquo;에 맞는 서비스가 없습니다.
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            위 AI 카드로 바로 질문할 수 있습니다.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section aria-label="검색 결과" aria-live="polite">
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-3">
        {results.length}개의 서비스
      </p>
      <div className="flex flex-col gap-3">
        {results.map((service) => (
          <ResultCard key={service.id} service={service} />
        ))}
      </div>
    </section>
  )
}

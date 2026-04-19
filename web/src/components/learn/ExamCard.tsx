'use client'

import Link from 'next/link'
import type { ExamMeta, ProgressRecord } from '@/lib/quiz/types'

interface ExamCardProps {
  exam: ExamMeta
  progress: ProgressRecord
}

export function ExamCard({ exam, progress }: ExamCardProps) {
  const seenCount = progress.seen.length
  const correctCount = progress.correct.length
  const pct = exam.totalQuestions > 0 ? Math.round((seenCount / exam.totalQuestions) * 100) : 0
  const correctPct = seenCount > 0 ? Math.round((correctCount / seenCount) * 100) : 0

  return (
    <Link href={`/learn/${exam.slug}`} className="group block">
      <div className="rounded-xl border border-zinc-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            {exam.nameEn}
          </p>
          <h2 className="mt-0.5 text-lg font-bold text-zinc-900 dark:text-zinc-50">
            {exam.nameKo}
          </h2>
        </div>

        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2">
          {exam.description}
        </p>

        <div className="mb-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span>진도</span>
          <span>{seenCount} / {exam.totalQuestions} ({pct}%)</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        {seenCount > 0 && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            정답률{' '}
            <span className="font-medium text-green-600 dark:text-green-400">{correctPct}%</span>
            {' '}({correctCount}/{seenCount})
          </p>
        )}
      </div>
    </Link>
  )
}

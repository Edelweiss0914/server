'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { ProgressRecord } from '@/lib/quiz/types'

interface ModeSelectorProps {
  examSlug: string
  totalQuestions: number
}

export default function ModeSelector({ examSlug, totalQuestions }: ModeSelectorProps) {
  const router = useRouter()
  const [wrongCount, setWrongCount] = useState<number | null>(null)
  const [randomQ, setRandomQ] = useState(true)
  const [randomOpts, setRandomOpts] = useState(false)

  const startQuiz = useCallback((mode: string, count?: number) => {
    const t = Date.now()
    const countPart = count ? `&count=${count}` : ''
    const rqPart = `&rq=${randomQ ? 1 : 0}`
    const roPart = `&ro=${randomOpts ? 1 : 0}`
    router.push(`/learn/${examSlug}/quiz?mode=${mode}${countPart}${rqPart}${roPart}&t=${t}`)
  }, [examSlug, router, randomQ, randomOpts])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`cheeze-quiz-${examSlug}`)
      if (raw) {
        const record = JSON.parse(raw) as ProgressRecord
        setWrongCount(record.wrong?.length ?? 0)
      } else {
        setWrongCount(0)
      }
    } catch {
      setWrongCount(0)
    }
  }, [examSlug])

  const hasWrong = wrongCount !== null && wrongCount > 0

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Card 1 — 실전 모의고사 */}
        <button
          onClick={() => startQuiz('exam', 65)}
          className="group flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 text-left transition-all hover:border-blue-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-blue-500"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl">📝</span>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              실전
            </span>
          </div>
          <div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">실전 모의고사</p>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">65문항 · 130분 제한</p>
          </div>
        </button>

        {/* Card 2 — 전체 랜덤 */}
        <button
          onClick={() => startQuiz('all')}
          className="group flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 text-left transition-all hover:border-purple-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-purple-500"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl">🔀</span>
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
              랜덤
            </span>
          </div>
          <div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">전체 랜덤</p>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{totalQuestions}문제 무작위</p>
          </div>
        </button>

        {/* Card 3 — 오답 노트*/}
        <div
          className={`flex flex-col gap-3 rounded-xl border p-5 transition-all ${
            wrongCount === null
              ? 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
              : hasWrong
              ? 'border-zinc-200 bg-white hover:border-red-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-red-500'
              : 'border-zinc-200 bg-zinc-50 opacity-50 dark:border-zinc-800 dark:bg-zinc-900/50'
          }`}
        >
          {hasWrong ? (
            <button
              onClick={() => startQuiz('wrong')}
              className="flex h-full w-full flex-col gap-3 text-left"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">❌</span>
                <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
                  {wrongCount}
                </span>
              </div>
              <div>
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">오답 노트</p>
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{wrongCount}문제</p>
              </div>
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-2xl">❌</span>
                {wrongCount === null ? (
                  <span className="h-5 w-10 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
                ) : (
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    없음
                  </span>
                )}
              </div>
              <div>
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">오답 노트</p>
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                  {wrongCount === null ? '...' : '오답 없음'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Study settings */}
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">학습 설정</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={randomQ}
              onChange={() => setRandomQ(v => !v)}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
            />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">문제 순서 랜덤</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={randomOpts}
              onChange={() => setRandomOpts(v => !v)}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
            />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">선택지 순서 랜덤</span>
          </label>
        </div>
      </div>
    </div>
  )
}

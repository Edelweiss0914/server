'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { ProgressRecord } from '@/lib/quiz/types'

interface ModeSelectorProps {
  examSlug: string
  totalQuestions: number
}

export default function ModeSelector({ examSlug, totalQuestions }: ModeSelectorProps) {
  const [wrongCount, setWrongCount] = useState<number | null>(null)

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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* Card 1 — 실전 모의고사 */}
      <Link
        href={`/learn/${examSlug}/quiz?mode=exam&count=65`}
        className="group flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 transition-all hover:border-blue-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-blue-500"
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
      </Link>

      {/* Card 2 — 전체 랜덤 */}
      <Link
        href={`/learn/${examSlug}/quiz?mode=all`}
        className="group flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 transition-all hover:border-purple-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-purple-500"
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
      </Link>

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
          <Link
            href={`/learn/${examSlug}/quiz?mode=wrong`}
            className="flex h-full flex-col gap-3"
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
          </Link>
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
  )
}

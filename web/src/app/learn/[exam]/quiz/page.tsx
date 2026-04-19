'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { getExamMeta, getExamQuestions } from '@/data/questions/index'
import type { QuizQuestion, ExamMeta } from '@/data/questions/index'
import { useProgress } from '@/lib/quiz/useProgress'

interface PageProps {
  params: { exam: string }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function QuizPage({ params }: PageProps) {
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode') ?? 'all'
  const countParam = parseInt(searchParams.get('count') ?? '0', 10)

  const meta = getExamMeta(params.exam)
  const allQuestions = getExamQuestions(params.exam)
  const { progress, markCorrect, markWrong, markSeen } = useProgress(params.exam)

  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [score, setScore] = useState({ correct: 0, total: 0 })
  const [finished, setFinished] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [timerEnabled, setTimerEnabled] = useState(true)
  const [startTime] = useState(Date.now())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Build question list based on mode
  useEffect(() => {
    if (allQuestions.length === 0) return
    let pool: QuizQuestion[] = []
    if (mode === 'wrong') {
      pool = allQuestions.filter((q) => progress.wrong.includes(q.id))
      if (pool.length === 0) pool = allQuestions
    } else {
      pool = allQuestions
    }
    const shuffled = shuffle(pool)
    const count = countParam > 0 ? Math.min(countParam, shuffled.length) : shuffled.length
    setQuestions(shuffled.slice(0, count))
    setCurrentIndex(0)
    setSelectedOption(null)
    setSubmitted(false)
    setScore({ correct: 0, total: 0 })
    setFinished(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.exam, mode, countParam])

  // Timer setup
  useEffect(() => {
    if (!meta || questions.length === 0 || !timerEnabled) return
    // estimate 2 min per question if no explicit timeLimit, else use timeLimit minutes
    const totalSeconds = (meta as unknown as { timeLimit?: number }).timeLimit
      ? ((meta as unknown as { timeLimit: number }).timeLimit * 60)
      : questions.length * 120
    setTimeLeft(totalSeconds)
  }, [meta, questions, timerEnabled])

  // Timer countdown
  useEffect(() => {
    if (timeLeft === null || !timerEnabled || finished) return
    if (timeLeft <= 0) {
      setFinished(true)
      return
    }
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          setFinished(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [timeLeft, timerEnabled, finished])

  const currentQuestion = questions[currentIndex]

  const handleSelect = useCallback((idx: number) => {
    if (submitted) return
    setSelectedOption(idx)
  }, [submitted])

  const handleSubmit = useCallback(() => {
    if (selectedOption === null || !currentQuestion) return
    const isCorrect = selectedOption === currentQuestion.answer
    setSubmitted(true)
    setScore((prev) => ({
      correct: isCorrect ? prev.correct + 1 : prev.correct,
      total: prev.total + 1,
    }))
    markSeen(currentQuestion.id)
    if (isCorrect) {
      markCorrect(currentQuestion.id)
    } else {
      markWrong(currentQuestion.id)
    }
  }, [selectedOption, currentQuestion, markSeen, markCorrect, markWrong])

  const handleNext = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      setFinished(true)
      if (timerRef.current) clearInterval(timerRef.current)
    } else {
      setCurrentIndex((i) => i + 1)
      setSelectedOption(null)
      setSubmitted(false)
    }
  }, [currentIndex, questions.length])

  const handleRestart = useCallback(() => {
    const reshuffled = shuffle(allQuestions)
    const count = countParam > 0 ? Math.min(countParam, reshuffled.length) : reshuffled.length
    setQuestions(reshuffled.slice(0, count))
    setCurrentIndex(0)
    setSelectedOption(null)
    setSubmitted(false)
    setScore({ correct: 0, total: 0 })
    setFinished(false)
    if (meta && timerEnabled) {
      const totalSeconds = (meta as unknown as { timeLimit?: number }).timeLimit
        ? ((meta as unknown as { timeLimit: number }).timeLimit * 60)
        : reshuffled.length * 120
      setTimeLeft(totalSeconds)
    }
  }, [allQuestions, countParam, meta, timerEnabled])

  if (!meta) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Link href="/learn" className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
          &larr; 목록으로
        </Link>
        <p className="mt-4 text-zinc-500 dark:text-zinc-400">시험을 찾을 수 없습니다.</p>
      </main>
    )
  }

  if (questions.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-zinc-500 dark:text-zinc-400">문제를 불러오는 중...</p>
      </main>
    )
  }

  if (finished) {
    const elapsed = Math.round((Date.now() - startTime) / 1000)
    const pct = questions.length > 0 ? Math.round((score.correct / score.total) * 100) : 0
    const metaWithPass = meta as unknown as { passingScore?: number }
    const passing = metaWithPass.passingScore ?? 72
    const passed = pct >= passing

    return (
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900 text-center">
          <div className={`mb-2 inline-block rounded-full px-3 py-1 text-sm font-medium ${passed ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
            {passed ? '합격' : '불합격'}
          </div>
          <p className="mt-4 text-5xl font-bold text-zinc-900 dark:text-zinc-50">{pct}%</p>
          <p className="mt-2 text-zinc-500 dark:text-zinc-400">
            {score.correct} / {score.total} 정답
          </p>
          <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
            소요 시간: {formatTime(elapsed)} · 합격 기준: {passing}%
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={handleRestart}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              다시 풀기
            </button>
            <Link
              href="/learn"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              &larr; 시험 목록
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const q = currentQuestion
  const optionLabels = ['A', 'B', 'C', 'D']

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          href={`/learn/${params.exam}`}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
        >
          &larr; {meta.nameKo}
        </Link>
        <div className="flex items-center gap-3">
          {timeLeft !== null && timerEnabled && (
            <span className={`font-mono text-sm font-medium ${timeLeft < 60 ? 'text-red-500' : 'text-zinc-600 dark:text-zinc-300'}`}>
              {formatTime(timeLeft)}
            </span>
          )}
          <button
            onClick={() => setTimerEnabled((v) => !v)}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          >
            {timerEnabled ? '타이머 끄기' : '타이머 켜기'}
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-2 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
        <span>Q {currentIndex + 1} / {questions.length}</span>
        <span>{score.correct} 정답</span>
      </div>
      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${((currentIndex) / questions.length) * 100}%` }}
        />
      </div>

      {/* Question card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex items-center gap-2">
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {q.category}
          </span>
        </div>

        <p className="mb-6 text-base leading-relaxed text-zinc-900 dark:text-zinc-50">
          {q.question}
        </p>

        <div className="flex flex-col gap-2">
          {q.options.map((opt, idx) => {
            let cls = 'rounded-lg border px-4 py-3 text-left text-sm transition-colors '
            if (!submitted) {
              cls += selectedOption === idx
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500'
                : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
            } else {
              if (idx === q.answer) {
                cls += 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 dark:border-green-500'
              } else if (idx === selectedOption) {
                cls += 'border-red-400 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 dark:border-red-400'
              } else {
                cls += 'border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500'
              }
            }
            return (
              <button key={idx} className={cls} onClick={() => handleSelect(idx)} disabled={submitted}>
                <span className="font-medium">{optionLabels[idx]}.</span> {opt.replace(/^[A-D]\.\s*/, '')}
              </button>
            )
          })}
        </div>

        {!submitted && selectedOption !== null && (
          <button
            onClick={handleSubmit}
            className="mt-4 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            제출
          </button>
        )}

        {submitted && (
          <div className={`mt-4 rounded-lg border p-4 ${selectedOption === q.answer ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'}`}>
            <p className={`mb-2 text-sm font-medium ${selectedOption === q.answer ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
              {selectedOption === q.answer ? '정답입니다!' : `오답입니다. 정답: ${optionLabels[q.answer]}`}
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{q.explanation}</p>
          </div>
        )}

        {submitted && (
          <button
            onClick={handleNext}
            className="mt-4 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {currentIndex + 1 >= questions.length ? '결과 보기' : '다음 문제'}
          </button>
        )}
      </div>
    </main>
  )
}

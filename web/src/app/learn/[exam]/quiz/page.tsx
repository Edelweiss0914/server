'use client'

import { use, useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { getExamMeta, getExamQuestions } from '@/data/questions/index'
import type { QuizQuestion } from '@/data/questions/index'
import { useProgress } from '@/lib/quiz/useProgress'

interface PageProps {
  params: Promise<{ exam: string }>
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

// Per-question state cache for prev/next navigation
interface CachedState {
  selectedOption: number | null
  selectedOptions: number[]
  submitted: boolean
  revealed: boolean
  noteDraft: string
}

export default function QuizPage({ params }: PageProps) {
  const { exam } = use(params)
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode') ?? 'all'
  const countParam = parseInt(searchParams.get('count') ?? '0', 10)
  const tParam = searchParams.get('t') ?? ''
  const randomQ = searchParams.get('rq') !== '0'
  const randomOpts = searchParams.get('ro') === '1'

  const meta = getExamMeta(exam)
  const allQuestions = getExamQuestions(exam)
  const { progress, loaded: progressLoaded, markCorrect, markWrong, markSeen, saveNote } = useProgress(exam)

  const progressWrongRef = useRef<string[]>([])
  useEffect(() => { progressWrongRef.current = progress.wrong }, [progress.wrong])

  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [noWrongAnswers, setNoWrongAnswers] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [selectedOptions, setSelectedOptions] = useState<number[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [score, setScore] = useState({ correct: 0, total: 0 })
  const [finished, setFinished] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [timerEnabled, setTimerEnabled] = useState(true)
  const [startTime] = useState(Date.now())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Per-question state cache (ref to avoid re-renders)
  const stateCache = useRef<Map<number, CachedState>>(new Map())
  // Option shuffle maps (ref, keyed by question ID)
  const optMapsRef = useRef<Map<string, number[]>>(new Map())

  // Save current question state to cache
  const saveCurrent = useCallback(() => {
    stateCache.current.set(currentIndex, {
      selectedOption,
      selectedOptions,
      submitted,
      revealed,
      noteDraft,
    })
  }, [currentIndex, selectedOption, selectedOptions, submitted, revealed])

  // Restore question state from cache
  const restoreState = useCallback((idx: number) => {
    const cached = stateCache.current.get(idx)
    if (cached) {
      setSelectedOption(cached.selectedOption)
      setSelectedOptions(cached.selectedOptions)
      setSubmitted(cached.submitted)
      setRevealed(cached.revealed)
      setNoteDraft(cached.noteDraft)
    } else {
      setSelectedOption(null)
      setSelectedOptions([])
      setSubmitted(false)
      setRevealed(false)
      setNoteDraft('')
    }
    setNoteSaved(false)
  }, [])

  // Get option map for a question (shuffle or identity)
  const getOptMap = useCallback((q: QuizQuestion): number[] => {
    if (!randomOpts) return q.options.map((_, i) => i)
    if (!optMapsRef.current.has(q.id)) {
      optMapsRef.current.set(q.id, shuffle(q.options.map((_, i) => i)))
    }
    return optMapsRef.current.get(q.id)!
  }, [randomOpts])

  // Build question list based on mode
  useEffect(() => {
    if (allQuestions.length === 0) return
    let pool: QuizQuestion[] = []
    if (mode === 'wrong') {
      if (!progressLoaded) return
      pool = allQuestions.filter((q) => progressWrongRef.current.includes(q.id))
      if (pool.length === 0) {
        setNoWrongAnswers(true)
        return
      }
      setNoWrongAnswers(false)
    } else {
      pool = allQuestions
    }
    const ordered = randomQ ? shuffle(pool) : [...pool]
    const count = countParam > 0 ? Math.min(countParam, ordered.length) : ordered.length
    setQuestions(ordered.slice(0, count))
    setCurrentIndex(0)
    setSelectedOption(null)
    setSelectedOptions([])
    setSubmitted(false)
    setRevealed(false)
    setScore({ correct: 0, total: 0 })
    setFinished(false)
    stateCache.current = new Map()
    optMapsRef.current = new Map()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, mode, countParam, tParam, progressLoaded, randomQ])

  // Timer setup
  useEffect(() => {
    if (!meta || questions.length === 0 || !timerEnabled) return
    let totalSeconds: number
    if (mode === 'exam') {
      totalSeconds = 130 * 60
    } else if ((meta as unknown as { timeLimit?: number }).timeLimit) {
      totalSeconds = (meta as unknown as { timeLimit: number }).timeLimit * 60
    } else {
      totalSeconds = questions.length * 120
    }
    setTimeLeft(totalSeconds)
  }, [meta, questions, timerEnabled, mode])

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
  const isMulti = currentQuestion ? Array.isArray(currentQuestion.answer) : false
  const isLocked = submitted || revealed

  const handleSelect = useCallback((origIdx: number) => {
    if (submitted || revealed) return
    if (isMulti) {
      setSelectedOptions((prev) =>
        prev.includes(origIdx) ? prev.filter((i) => i !== origIdx) : [...prev, origIdx]
      )
    } else {
      setSelectedOption(origIdx)
    }
  }, [submitted, revealed, isMulti])

  const handleSubmit = useCallback(() => {
    if (!currentQuestion || submitted || revealed) return
    if (isMulti) {
      if (selectedOptions.length === 0) return
      const correct = (currentQuestion.answer as number[]).slice().sort()
      const selected = selectedOptions.slice().sort()
      const isCorrect = correct.length === selected.length && correct.every((v, i) => v === selected[i])
      setSubmitted(true)
      setScore((prev) => ({
        correct: isCorrect ? prev.correct + 1 : prev.correct,
        total: prev.total + 1,
      }))
      markSeen(currentQuestion.id)
      if (isCorrect) markCorrect(currentQuestion.id)
      else markWrong(currentQuestion.id)
    } else {
      if (selectedOption === null) return
      const isCorrect = selectedOption === (currentQuestion.answer as number)
      setSubmitted(true)
      setScore((prev) => ({
        correct: isCorrect ? prev.correct + 1 : prev.correct,
        total: prev.total + 1,
      }))
      markSeen(currentQuestion.id)
      if (isCorrect) markCorrect(currentQuestion.id)
      else markWrong(currentQuestion.id)
    }
  }, [selectedOption, selectedOptions, currentQuestion, isMulti, submitted, revealed, markSeen, markCorrect, markWrong])

  const handleReveal = useCallback(() => {
    if (!currentQuestion || submitted || revealed) return
    setRevealed(true)
    markSeen(currentQuestion.id)
  }, [currentQuestion, submitted, revealed, markSeen])

  // Navigation: prev / next (save & restore state)
  const handlePrev = useCallback(() => {
    if (currentIndex <= 0) return
    saveCurrent()
    const newIdx = currentIndex - 1
    setCurrentIndex(newIdx)
    restoreState(newIdx)
  }, [currentIndex, saveCurrent, restoreState])

  const handleNextNav = useCallback(() => {
    if (currentIndex >= questions.length - 1) return
    saveCurrent()
    const newIdx = currentIndex + 1
    setCurrentIndex(newIdx)
    restoreState(newIdx)
  }, [currentIndex, questions.length, saveCurrent, restoreState])

  const handleFinish = useCallback(() => {
    saveCurrent()
    setFinished(true)
    if (timerRef.current) clearInterval(timerRef.current)
  }, [saveCurrent])

  // Note
  const [noteDraft, setNoteDraft] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)
  const noteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (currentQuestion && (submitted || revealed)) {
      setNoteDraft(progress.notes?.[currentQuestion.id] ?? '')
      setNoteSaved(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id, submitted, revealed])

  const handleNoteChange = useCallback((text: string) => {
    setNoteDraft(text)
    setNoteSaved(false)
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current)
    noteSaveTimer.current = setTimeout(() => {
      saveNote(currentQuestion!.id, text)
      setNoteSaved(true)
      setTimeout(() => setNoteSaved(false), 1500)
    }, 500)
  }, [currentQuestion, saveNote])

  const handleRestart = useCallback(() => {
    let pool = allQuestions
    if (mode === 'wrong') {
      pool = allQuestions.filter(q => progressWrongRef.current.includes(q.id))
      if (pool.length === 0) { setNoWrongAnswers(true); return }
    }
    const ordered = randomQ ? shuffle(pool) : [...pool]
    const count = countParam > 0 ? Math.min(countParam, ordered.length) : ordered.length
    setQuestions(ordered.slice(0, count))
    setCurrentIndex(0)
    setSelectedOption(null)
    setSelectedOptions([])
    setSubmitted(false)
    setRevealed(false)
    setScore({ correct: 0, total: 0 })
    setFinished(false)
    setNoteDraft('')
    setNoteSaved(false)
    stateCache.current = new Map()
    optMapsRef.current = new Map()
    if (meta && timerEnabled) {
      let totalSeconds: number
      if (mode === 'exam') {
        totalSeconds = 130 * 60
      } else if ((meta as unknown as { timeLimit?: number }).timeLimit) {
        totalSeconds = (meta as unknown as { timeLimit: number }).timeLimit * 60
      } else {
        totalSeconds = ordered.length * 120
      }
      setTimeLeft(totalSeconds)
    }
  }, [allQuestions, countParam, meta, timerEnabled, mode, randomQ])

  // Cleanup note timer on unmount
  useEffect(() => {
    return () => {
      if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current)
    }
  }, [])

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

  if (mode === 'wrong' && noWrongAnswers) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-4xl mb-4">✅</p>
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-2">오답이 없습니다!</p>
        <p className="text-zinc-500 dark:text-zinc-400 mb-6">아직 틀린 문제가 없거나 모두 복습 완료했습니다.</p>
        <Link href={`/learn/${exam}`} className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
          시험으로 돌아가기
        </Link>
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
    const pct = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0
    const passing = (meta as unknown as { passingScore?: number }).passingScore ?? 72
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
            {score.total < questions.length && (
              <span className="text-zinc-400 dark:text-zinc-500"> (미응답 {questions.length - score.total})</span>
            )}
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
  const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F']
  const correctAnswers = Array.isArray(q.answer) ? q.answer : [q.answer]
  const optMap = getOptMap(q)

  // Correct answer labels in display order (for feedback)
  const correctDisplayLabels = correctAnswers.map(origIdx => {
    const displayIdx = optMap.indexOf(origIdx)
    return optionLabels[displayIdx]
  }).sort()

  const isAnswerCorrect = submitted
    ? isMulti
      ? (() => { const ca = (q.answer as number[]).slice().sort(); const sa = selectedOptions.slice().sort(); return ca.length === sa.length && ca.every((v, i) => v === sa[i]) })()
      : selectedOption === (q.answer as number)
    : false

  const submitEnabled = isMulti ? selectedOptions.length > 0 : selectedOption !== null

  const modeBadge =
    mode === 'exam'
      ? { label: '실전 모의고사', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' }
      : mode === 'all'
      ? { label: '전체 랜덤', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' }
      : mode === 'wrong'
      ? { label: '오답 노트', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' }
      : null

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/learn/${exam}`}
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
          {mode !== 'exam' && (
            <button
              onClick={() => setTimerEnabled((v) => !v)}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
            >
              {timerEnabled ? '타이머 끄기' : '타이머 켜기'}
            </button>
          )}
        </div>
      </div>

      {/* Settings badges */}
      {(randomQ || randomOpts) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {randomQ && (
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
              랜덤 문제
            </span>
          )}
          {randomOpts && (
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
              랜덤 선택지
            </span>
          )}
        </div>
      )}

      {/* Progress */}
      <div className="mb-2 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-2">
          Q {currentIndex + 1} / {questions.length}
          {modeBadge && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${modeBadge.cls}`}>
              {modeBadge.label}
            </span>
          )}
          {isMulti && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
              복수 정답
            </span>
          )}
        </span>
        <span>{score.correct} 정답</span>
      </div>
      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Question card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex items-center gap-2">
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {q.category}
          </span>
          {revealed && !submitted && (
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              정답 열람
            </span>
          )}
        </div>

        <p className="mb-6 text-base leading-relaxed text-zinc-900 dark:text-zinc-50 whitespace-pre-line">
          {q.question}
        </p>

        <div className="flex flex-col gap-2">
          {optMap.map((origIdx, displayIdx) => {
            const opt = q.options[origIdx]
            const isCorrectOption = correctAnswers.includes(origIdx)

            // Single-answer rendering
            if (!isMulti) {
              const isSelected = selectedOption === origIdx
              let cls = 'rounded-lg border px-4 py-3 text-left text-sm transition-colors '
              if (!isLocked) {
                cls += isSelected
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
              } else if (submitted) {
                if (isCorrectOption) {
                  cls += 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 dark:border-green-500'
                } else if (isSelected) {
                  cls += 'border-red-400 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 dark:border-red-400'
                } else {
                  cls += 'border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500'
                }
              } else {
                // revealed
                cls += isCorrectOption
                  ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 dark:border-green-500'
                  : 'border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500'
              }
              return (
                <button key={displayIdx} className={cls} onClick={() => handleSelect(origIdx)} disabled={isLocked}>
                  <span className="font-medium">{optionLabels[displayIdx]}.</span> {opt.replace(/^[A-F]\.\s*/, '')}
                </button>
              )
            }

            // Multi-answer rendering
            const isSelected = selectedOptions.includes(origIdx)
            let cls = 'flex items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors '
            if (!isLocked) {
              cls += isSelected
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500'
                : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
            } else if (submitted) {
              if (isCorrectOption && isSelected) {
                cls += 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 dark:border-green-500'
              } else if (isCorrectOption && !isSelected) {
                cls += 'border-green-400 bg-green-50/50 text-green-600 dark:bg-green-900/20 dark:text-green-400 dark:border-green-600'
              } else if (!isCorrectOption && isSelected) {
                cls += 'border-red-400 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 dark:border-red-400'
              } else {
                cls += 'border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500'
              }
            } else {
              // revealed
              cls += isCorrectOption
                ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 dark:border-green-500'
                : 'border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500'
            }

            let checkboxCls = 'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-2 '
            if (!isLocked) {
              checkboxCls += isSelected ? 'border-blue-500 bg-blue-500' : 'border-zinc-400 bg-white dark:border-zinc-500 dark:bg-zinc-700'
            } else if (submitted) {
              if (isCorrectOption && isSelected) checkboxCls += 'border-green-500 bg-green-500'
              else if (isCorrectOption && !isSelected) checkboxCls += 'border-green-400 bg-white dark:bg-zinc-800'
              else if (!isCorrectOption && isSelected) checkboxCls += 'border-red-400 bg-red-400'
              else checkboxCls += 'border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-700'
            } else {
              checkboxCls += isCorrectOption ? 'border-green-500 bg-green-500' : 'border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-700'
            }

            const showCheck = (submitted && (isSelected || isCorrectOption)) || (revealed && isCorrectOption)

            return (
              <button key={displayIdx} className={cls} onClick={() => handleSelect(origIdx)} disabled={isLocked}>
                <span className={checkboxCls}>
                  {showCheck && (
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 10 10">
                      <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span>
                  <span className="font-medium">{optionLabels[displayIdx]}.</span> {opt.replace(/^[A-F]\.\s*/, '')}
                </span>
              </button>
            )
          })}
        </div>

        {/* Action buttons */}
        {!isLocked && (
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleReveal}
              className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              정답보기
            </button>
            {submitEnabled && (
              <button
                onClick={handleSubmit}
                className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                제출
              </button>
            )}
          </div>
        )}

        {/* Feedback — submitted */}
        {submitted && (
          <div className={`mt-4 rounded-lg border p-4 ${isAnswerCorrect ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'}`}>
            <p className={`mb-2 text-sm font-medium ${isAnswerCorrect ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
              {isAnswerCorrect
                ? '정답입니다!'
                : `오답입니다. 정답: ${correctDisplayLabels.join(', ')}`}
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{q.explanation}</p>
          </div>
        )}

        {/* Feedback — revealed */}
        {revealed && !submitted && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <p className="mb-2 text-sm font-medium text-blue-700 dark:text-blue-300">
              정답: {correctDisplayLabels.join(', ')}
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{q.explanation}</p>
          </div>
        )}

        {/* Note */}
        {isLocked && (
          <div className="mt-3 relative">
            <textarea
              value={noteDraft}
              onChange={(e) => handleNoteChange(e.target.value)}
              placeholder="이 문제에 대한 메모..."
              rows={2}
              className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:placeholder-zinc-500"
            />
            {noteSaved && (
              <span className="absolute bottom-2 right-2 text-xs text-zinc-400">저장됨</span>
            )}
          </div>
        )}
      </div>

      {/* Navigation: prev / next / finish */}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          &larr; 이전
        </button>
        <button
          onClick={handleNextNav}
          disabled={currentIndex >= questions.length - 1}
          className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          다음 &rarr;
        </button>
        <button
          onClick={handleFinish}
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          결과
        </button>
      </div>
    </main>
  )
}

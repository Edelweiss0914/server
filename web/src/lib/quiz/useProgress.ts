'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ProgressRecord } from './types'

const STORAGE_KEY_PREFIX = 'cheeze-quiz-'

function loadFromStorage(examSlug: string): ProgressRecord {
  if (typeof window === 'undefined') return { correct: [], wrong: [], seen: [] }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + examSlug)
    if (raw) return JSON.parse(raw) as ProgressRecord
  } catch { /* ignore */ }
  return { correct: [], wrong: [], seen: [] }
}

function saveToStorage(examSlug: string, record: ProgressRecord): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + examSlug, JSON.stringify(record))
  } catch { /* ignore */ }
}

export function useProgress(examSlug: string) {
  const [progress, setProgress] = useState<ProgressRecord>({ correct: [], wrong: [], seen: [] })

  useEffect(() => {
    setProgress(loadFromStorage(examSlug))
  }, [examSlug])

  const markCorrect = useCallback((id: string) => {
    setProgress((prev) => {
      const next: ProgressRecord = {
        correct: prev.correct.includes(id) ? prev.correct : [...prev.correct, id],
        wrong: prev.wrong.filter((w) => w !== id),
        seen: prev.seen.includes(id) ? prev.seen : [...prev.seen, id],
      }
      saveToStorage(examSlug, next)
      return next
    })
  }, [examSlug])

  const markWrong = useCallback((id: string) => {
    setProgress((prev) => {
      const next: ProgressRecord = {
        correct: prev.correct.filter((c) => c !== id),
        wrong: prev.wrong.includes(id) ? prev.wrong : [...prev.wrong, id],
        seen: prev.seen.includes(id) ? prev.seen : [...prev.seen, id],
      }
      saveToStorage(examSlug, next)
      return next
    })
  }, [examSlug])

  const markSeen = useCallback((id: string) => {
    setProgress((prev) => {
      if (prev.seen.includes(id)) return prev
      const next: ProgressRecord = { ...prev, seen: [...prev.seen, id] }
      saveToStorage(examSlug, next)
      return next
    })
  }, [examSlug])

  const reset = useCallback(() => {
    const empty: ProgressRecord = { correct: [], wrong: [], seen: [] }
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem(STORAGE_KEY_PREFIX + examSlug) } catch { /* ignore */ }
    }
    setProgress(empty)
  }, [examSlug])

  return { progress, markCorrect, markWrong, markSeen, reset }
}

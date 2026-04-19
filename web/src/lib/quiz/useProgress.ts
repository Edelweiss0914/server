'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ProgressRecord } from './types'

const STORAGE_KEY_PREFIX = 'cheeze-quiz-'

function loadFromStorage(examSlug: string): ProgressRecord {
  if (typeof window === 'undefined') return { correct: [], wrong: [], seen: [], notes: {} }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + examSlug)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...parsed, notes: parsed.notes ?? {} } as ProgressRecord
    }
  } catch { /* ignore */ }
  return { correct: [], wrong: [], seen: [], notes: {} }
}

function saveToStorage(examSlug: string, record: ProgressRecord): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + examSlug, JSON.stringify(record))
  } catch { /* ignore */ }
}

export function useProgress(examSlug: string) {
  const [progress, setProgress] = useState<ProgressRecord>({ correct: [], wrong: [], seen: [], notes: {} })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setProgress(loadFromStorage(examSlug))
    setLoaded(true)
  }, [examSlug])

  const markCorrect = useCallback((id: string) => {
    setProgress((prev) => {
      const next: ProgressRecord = {
        correct: prev.correct.includes(id) ? prev.correct : [...prev.correct, id],
        wrong: prev.wrong.filter((w) => w !== id),
        seen: prev.seen.includes(id) ? prev.seen : [...prev.seen, id],
        notes: prev.notes,
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
        notes: prev.notes,
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

  const saveNote = useCallback((id: string, text: string) => {
    setProgress((prev) => {
      const notes = { ...prev.notes }
      if (text === '') {
        delete notes[id]
      } else {
        notes[id] = text
      }
      const next: ProgressRecord = { ...prev, notes }
      saveToStorage(examSlug, next)
      return next
    })
  }, [examSlug])

  const reset = useCallback(() => {
    const empty: ProgressRecord = { correct: [], wrong: [], seen: [], notes: {} }
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem(STORAGE_KEY_PREFIX + examSlug) } catch { /* ignore */ }
    }
    setProgress(empty)
  }, [examSlug])

  return { progress, loaded, markCorrect, markWrong, markSeen, saveNote, reset }
}

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { AI_CONFIG } from '@/lib/services'

interface AiSectionProps {
  query: string
  hasResults: boolean
  ollamaState: string
  onQueryChange: (query: string) => void
}

export function AiSection({
  query,
  hasResults,
  ollamaState,
  onQueryChange,
}: AiSectionProps) {
  const [response, setResponse] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [progressText, setProgressText] = useState('')
  const [followup, setFollowup] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const followupRef = useRef<HTMLInputElement>(null)

  const stopProgress = useCallback(() => {
    if (progressRef.current) {
      clearInterval(progressRef.current)
      progressRef.current = null
    }
    setProgressText('')
  }, [])

  const startProgress = useCallback(() => {
    let elapsed = 0
    progressRef.current = setInterval(() => {
      elapsed += 2
      if (ollamaState === 'running') {
        setProgressText('답변을 생성하는 중입니다...')
      } else if (elapsed < 10) {
        setProgressText('Ollama 시작 요청 중...')
      } else if (elapsed < 60) {
        setProgressText(`Ollama 가동 중... (${elapsed}초 경과)`)
      } else {
        const m = Math.floor(elapsed / 60)
        const s = elapsed % 60
        setProgressText(`대기 중... ${m}분 ${s}초 경과`)
      }
    }, 2000)
  }, [ollamaState])

  useEffect(() => {
    return () => {
      stopProgress()
      if (abortRef.current) abortRef.current.abort()
    }
  }, [stopProgress])

  const requestAi = useCallback(
    async (prompt: string) => {
      if (!AI_CONFIG.enabled || !prompt.trim()) return

      if (abortRef.current) abortRef.current.abort()
      abortRef.current = new AbortController()

      setLoading(true)
      setResponse(null)
      setFollowup('')

      const isReady = ollamaState === 'running'
      setStatus(
        isReady
          ? 'AI가 답변을 생성하는 중입니다...'
          : 'AI를 호출 중이에요 \u00b7 잠시만 기다려주세요'
      )
      if (!isReady) startProgress()

      const timeoutId = setTimeout(
        () => abortRef.current?.abort(),
        AI_CONFIG.timeoutMs
      )

      try {
        const res = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: AI_CONFIG.model,
            prompt,
            stream: false,
          }),
          signal: abortRef.current.signal,
        })

        if (!res.ok) {
          let details = ''
          try {
            const err = await res.json()
            details = err.message || err.error || ''
          } catch {
            /* noop */
          }
          throw new Error(details || `AI request failed with ${res.status}`)
        }

        const payload = await res.json()
        const text = payload.response || '응답이 비어 있습니다.'

        stopProgress()
        setStatus('CHEEZE AI 응답')
        setResponse(text)
        setLoading(false)
        setTimeout(() => followupRef.current?.focus(), 0)
      } catch (error: unknown) {
        stopProgress()
        const msg =
          error instanceof Error && error.name === 'AbortError'
            ? '응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'
            : error instanceof Error
              ? error.message
              : 'AI 호출에 실패했습니다.'
        setStatus('AI 요청 실패')
        setResponse(msg)
        setLoading(false)
      } finally {
        clearTimeout(timeoutId)
        abortRef.current = null
      }
    },
    [ollamaState, startProgress, stopProgress]
  )

  if (!query.trim() || !AI_CONFIG.enabled) return null

  return (
    <section className="flex flex-col gap-3" aria-live="polite">
      {/* Prompt card */}
      <button
        type="button"
        onClick={() => requestAi(query)}
        className="w-full rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 p-4 text-left hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
      >
        <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-500 dark:text-blue-400 mb-1">
          CHEEZE AI
        </div>
        <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          &ldquo;{query}&rdquo;을 질문하시겠습니까?
        </div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          {hasResults
            ? '서비스 카드는 유지되고, 이 카드를 누르면 AI 답변을 생성합니다.'
            : '일치하는 서비스가 없습니다. 이 카드를 눌러 AI에게 바로 질문하세요.'}
        </div>
        <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2">
          AI는 정확하지 않을 수 있습니다. 중요한 내용은 재차 검토해 주세요.
        </div>
      </button>

      {/* Response card */}
      {(loading || response !== null) && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 p-4">
          {status && (
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
              {status}
            </div>
          )}

          {/* Progress indicator */}
          {loading && progressText && (
            <div className="mb-3">
              <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-500" />
              </div>
              <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                {progressText}
              </div>
            </div>
          )}

          {response !== null && (
            <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {response}
            </div>
          )}

          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-3">
            AI는 정확하지 않을 수 있습니다. 중요한 내용은 재차 검토해 주세요.
          </div>

          {/* Follow-up form */}
          {response !== null && !loading && (
            <form
              className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-700/50"
              onSubmit={(e) => {
                e.preventDefault()
                const q = followup.trim()
                if (!q) return
                onQueryChange(q)
                requestAi(q)
              }}
            >
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">
                다음 질문
              </label>
              <div className="flex gap-2">
                <input
                  ref={followupRef}
                  type="search"
                  value={followup}
                  onChange={(e) => {
                    setFollowup(e.target.value)
                    if (e.target.value.trim()) {
                      onQueryChange(e.target.value)
                    }
                  }}
                  placeholder="답변을 읽은 뒤 바로 이어서 질문하세요"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:focus:border-blue-500 transition-all"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  질문
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  )
}

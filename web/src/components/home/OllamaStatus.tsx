'use client'

import { useEffect, useState } from 'react'

type OllamaState = 'running' | 'offline' | 'starting' | 'unknown'

export function useOllamaState() {
  const [state, setState] = useState<OllamaState>('unknown')

  useEffect(() => {
    let mounted = true

    async function refresh() {
      try {
        const res = await fetch('/api/control/services/ollama')
        if (!res.ok) throw new Error('fetch failed')
        const data = await res.json()
        if (mounted) setState((data.state as OllamaState) || 'offline')
      } catch {
        if (mounted) setState('offline')
      }
    }

    refresh()
    const interval = setInterval(refresh, 15000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  return state
}

interface OllamaStatusProps {
  state: string
}

export function OllamaStatus({ state }: OllamaStatusProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  let dotClass: string
  let label: string

  if (state === 'running') {
    dotClass = 'bg-green-500'
    label = '현재 답변속도: 빠름'
  } else if (state === 'offline' || state === 'starting') {
    dotClass = 'bg-yellow-500'
    label = '현재 답변속도: 약간 시간 소요'
  } else {
    dotClass = 'bg-red-500'
    label = '현재 답변속도: 약 3~5분 소요'
  }

  return (
    <div className="flex items-center justify-center gap-2 py-1">
      <span className={`inline-block h-2 w-2 rounded-full ${dotClass} animate-pulse`} />
      <span className="text-xs text-zinc-400 dark:text-zinc-500">
        AI &middot; {label}
      </span>
    </div>
  )
}

'use client'

import { useEffect, useRef } from 'react'

interface SearchBarProps {
  query: string
  onSearch: (query: string) => void
  onEnter: () => void
  onAskAi: () => void
}

export function SearchBar({ query, onSearch, onEnter, onAskAi }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.key === '/' &&
        document.activeElement !== inputRef.current
      ) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (window.innerWidth > 768) {
      inputRef.current?.focus()
    }
  }, [])

  return (
    <div className="w-full">
      <div className="relative flex items-center">
        <svg
          className="absolute left-3.5 text-zinc-400 dark:text-zinc-500 pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault()
                onAskAi()
                return
              }
              onEnter()
            }
            if (e.key === 'Escape') {
              onSearch('')
              inputRef.current?.blur()
            }
          }}
          placeholder="서비스 검색...  (예: 클라우드, nextcloud)"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="서비스 검색"
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 py-3 pl-11 pr-10 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:focus:border-blue-500 transition-all"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              onSearch('')
              inputRef.current?.focus()
            }}
            className="absolute right-3 flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            aria-label="검색어 지우기"
            tabIndex={-1}
          >
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-xs text-zinc-400 dark:text-zinc-500">
        <kbd className="rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono">Enter</kbd>{' '}
        첫 번째 결과로 이동 &nbsp;&middot;&nbsp;{' '}
        <kbd className="rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono">/</kbd>{' '}
        검색창 포커스 &nbsp;&middot;&nbsp;{' '}
        <kbd className="rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono">Esc</kbd>{' '}
        초기화
      </p>
    </div>
  )
}

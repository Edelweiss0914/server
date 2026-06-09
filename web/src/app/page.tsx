'use client'

import { useState, useCallback, useEffect, useReducer } from 'react'
import { useAuth } from '@/lib/useAuth'
import { LoginForm } from '@/components/auth/LoginForm'
import { Footer } from '@/components/layout/Footer'
import { SearchBar } from '@/components/home/SearchBar'
import { QuickGrid } from '@/components/home/QuickGrid'
import { SearchResults } from '@/components/home/SearchResults'
import { AiSection } from '@/components/home/AiSection'
import { OllamaStatus, useOllamaState } from '@/components/home/OllamaStatus'
import { searchServices, SERVICES } from '@/lib/services'
import { PrivacyPolicyModal } from '@/components/privacy/PrivacyPolicyModal'
import { usePrivacyConsent } from '@/components/privacy/usePrivacyConsent'

function formatDate(): string {
  return new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
}

export default function Home() {
  const { user, login, logout, isLoading } = useAuth()
  const [query, setQuery] = useState('')
  const results = searchServices(query)
  const ollamaState = useOllamaState()
  const [aiTrigger, setAiTrigger] = useState(0)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  const { isOpen, recordConsent, openModal, closeModal } = usePrivacyConsent()

  const activeServiceCount = SERVICES.filter((s) => s.status === 'online').length

  useEffect(() => {
    const onFocus = () => forceUpdate()
    window.addEventListener('focus', onFocus)
    window.addEventListener('popstate', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('popstate', onFocus)
    }
  }, [])

  const handleSearch = useCallback((q: string) => {
    setQuery(q)
  }, [])

  const handleEnter = useCallback(() => {
    if (results.length > 0) {
      window.open(results[0].url, '_blank', 'noopener,noreferrer')
    }
  }, [results])

  const handleAskAi = useCallback(() => {
    setAiTrigger((n) => n + 1)
  }, [])

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <>
        <LoginForm onLogin={login} />
        {isOpen && (
          <PrivacyPolicyModal onConsent={recordConsent} onDismiss={closeModal} />
        )}
      </>
    )
  }

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-950">
      {/* Top bar */}
      <div className="w-full border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <svg
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-7 h-7 shrink-0"
              aria-hidden="true"
            >
              <circle cx="50" cy="50" r="11" fill="#4f7fff" />
              <ellipse cx="50" cy="24" rx="7" ry="13" fill="#a0b8ff" opacity="0.85" />
              <ellipse cx="50" cy="24" rx="7" ry="13" fill="#a0b8ff" opacity="0.85" transform="rotate(180 50 50)" />
              <ellipse cx="50" cy="24" rx="7" ry="13" fill="#a0b8ff" opacity="0.85" transform="rotate(60 50 50)" />
              <ellipse cx="50" cy="24" rx="7" ry="13" fill="#a0b8ff" opacity="0.85" transform="rotate(120 50 50)" />
              <ellipse cx="50" cy="24" rx="7" ry="13" fill="#a0b8ff" opacity="0.85" transform="rotate(240 50 50)" />
              <ellipse cx="50" cy="24" rx="7" ry="13" fill="#a0b8ff" opacity="0.85" transform="rotate(300 50 50)" />
              <circle cx="50" cy="50" r="13" fill="#4f7fff" />
              <circle cx="50" cy="50" r="7" fill="white" opacity="0.9" />
            </svg>
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 hidden sm:block">
              CHEEZE 통합 업무 플랫폼
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-600 dark:text-zinc-300">{user.name}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ${
                user.role === 'admin'
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                  : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              {user.role === 'admin' ? 'ADMIN' : 'MEMBER'}
            </span>
            <button
              type="button"
              onClick={logout}
              className="ml-1 rounded-lg border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>

      <main className="w-full max-w-3xl mx-auto px-4 flex-1 py-6">
        {/* Welcome */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            {user.name}님, 안녕하세요
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{formatDate()}</p>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 p-4 shadow-sm">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">활성 서비스</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mt-1">{activeServiceCount}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 p-4 shadow-sm">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">보안 등급</p>
            <p className="text-base font-bold text-blue-600 dark:text-blue-400 mt-1">Zero Trust</p>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 p-4 shadow-sm">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">가동률</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mt-1">99.9%</p>
          </div>
        </div>

        {/* Admin console link */}
        {user.role === 'admin' && (
          <div className="mb-6">
            <a
              href="/admin"
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-4 py-2.5 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              관리자 콘솔
            </a>
          </div>
        )}

        {/* Service grid */}
        <section className="mb-6">
          <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">
            업무 서비스
          </p>
          <QuickGrid />
        </section>

        <OllamaStatus state={ollamaState} />

        {/* Search + AI */}
        <div className="mt-4">
          <SearchBar
            query={query}
            onSearch={handleSearch}
            onEnter={handleEnter}
            onAskAi={handleAskAi}
          />
        </div>

        <div className="mt-6 flex flex-col gap-6">
          {query.trim() ? (
            <>
              <AiSection
                key={aiTrigger}
                query={query}
                hasResults={results.length > 0}
                ollamaState={ollamaState}
                onQueryChange={handleSearch}
              />
              <SearchResults results={results} query={query} />
            </>
          ) : null}
        </div>
      </main>

      <Footer onPrivacyClick={openModal} />
      {isOpen && (
        <PrivacyPolicyModal onConsent={recordConsent} onDismiss={closeModal} />
      )}
    </div>
  )
}

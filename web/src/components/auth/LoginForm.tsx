'use client'

import { useState, FormEvent } from 'react'
import type { useAuth } from '@/lib/useAuth'

interface LoginFormProps {
  onLogin: ReturnType<typeof useAuth>['login']
  onSSOLogin: ReturnType<typeof useAuth>['loginWithSSO']
}

export function LoginForm({ onLogin, onSSOLogin }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [ssoLoading, setSsoLoading] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      onLogin(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSSO(provider: 'cloudflare' | 'google') {
    setError('')
    setSsoLoading(provider)
    // Simulate SSO redirect delay
    await new Promise((r) => setTimeout(r, 1200))
    try {
      onSSOLogin(provider)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SSO 인증에 실패했습니다.')
      setSsoLoading(null)
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-blue-500/10 blur-2xl scale-150" />
            <svg
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-label="CHEEZE 로고"
              role="img"
              className="relative w-16 h-16"
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
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              CHEEZE
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              통합 업무 플랫폼
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 shadow-sm p-6">
          <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-100 mb-5">
            SSO 통합 인증
          </h2>

          {/* SSO Provider Buttons */}
          <div className="flex flex-col gap-2.5 mb-5">
            <button
              type="button"
              onClick={() => handleSSO('cloudflare')}
              disabled={!!ssoLoading}
              className="flex items-center gap-3 w-full rounded-lg border border-zinc-200 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {ssoLoading === 'cloudflare' ? (
                <div className="w-5 h-5 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none">
                  <path d="M16.5 7.2l-.6 2.1c-.1.2 0 .5.2.6.1.1.3.1.4.1h4.4c.2 0 .3.1.3.3 0 .1 0 .2-.1.2l-1.2.8c-.2.1-.2.4-.1.6l.5 1.6c.1.2 0 .3-.2.4-.1 0-.2 0-.3-.1l-1.3-.9c-.2-.1-.4-.1-.5 0l-1.3.9c-.2.1-.4.1-.5-.1-.1-.1-.1-.2 0-.3l.5-1.6c.1-.2 0-.5-.1-.6l-1.2-.8c-.2-.1-.2-.4-.1-.5.1-.1.2-.1.3-.1h1.6" fill="#F48120"/>
                  <path d="M6.5 17.3c-.3 0-.5-.1-.7-.3l-.3-.6 1.1-3.8c.1-.3 0-.6-.2-.8L3 9.5c-.3-.2-.4-.5-.3-.8.1-.3.3-.4.6-.5h3.9c.3 0 .5-.2.6-.4L9.3 4c.1-.3.4-.5.7-.5s.6.2.7.5l1.5 3.8c.1.3.3.4.6.4h3.9" fill="#FAAD3F"/>
                </svg>
              )}
              {ssoLoading === 'cloudflare' ? 'Cloudflare Access 인증 중...' : 'Cloudflare Access로 로그인'}
            </button>

            <button
              type="button"
              onClick={() => handleSSO('google')}
              disabled={!!ssoLoading}
              className="flex items-center gap-3 w-full rounded-lg border border-zinc-200 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {ssoLoading === 'google' ? (
                <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              {ssoLoading === 'google' ? 'Google Workspace 인증 중...' : 'Google Workspace로 로그인'}
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
            <span className="text-xs text-zinc-400 dark:text-zinc-500">또는 이메일로 로그인</span>
            <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
          </div>

          {/* Email/Password form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
              >
                이메일
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="이메일 주소 입력"
                className="rounded-lg border border-zinc-200 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:focus:border-blue-500 transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
              >
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="비밀번호 입력"
                className="rounded-lg border border-zinc-200 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:focus:border-blue-500 transition-all"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !!ssoLoading}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {isSubmitting ? '로그인 중...' : '로그인'}
            </button>
          </form>
        </div>

        {/* SSO info */}
        <div className="mt-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 p-3">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed text-center">
            SSO(Single Sign-On) 통합 인증 — 하나의 계정으로 모든 업무 서비스에 접근
          </p>
          <div className="flex items-center justify-center gap-4 mt-2">
            <span className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500">
              <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor"><path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 1.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zm2.85 3.15a.75.75 0 010 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 111.06-1.06l.97.97 2.97-2.97a.75.75 0 011.06 0z"/></svg>
              Zero Trust
            </span>
            <span className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500">
              <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor"><path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 1.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zm2.85 3.15a.75.75 0 010 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 111.06-1.06l.97.97 2.97-2.97a.75.75 0 011.06 0z"/></svg>
              JWT 세션
            </span>
            <span className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500">
              <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor"><path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 1.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zm2.85 3.15a.75.75 0 010 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 111.06-1.06l.97.97 2.97-2.97a.75.75 0 011.06 0z"/></svg>
              8시간 TTL
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

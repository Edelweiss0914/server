'use client'

import { useState, FormEvent } from 'react'
import type { useAuth } from '@/lib/useAuth'

interface LoginFormProps {
  onLogin: ReturnType<typeof useAuth>['login']
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

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
              <ellipse
                cx="50" cy="24" rx="7" ry="13" fill="#a0b8ff" opacity="0.85"
                transform="rotate(180 50 50)"
              />
              <ellipse
                cx="50" cy="24" rx="7" ry="13" fill="#a0b8ff" opacity="0.85"
                transform="rotate(60 50 50)"
              />
              <ellipse
                cx="50" cy="24" rx="7" ry="13" fill="#a0b8ff" opacity="0.85"
                transform="rotate(120 50 50)"
              />
              <ellipse
                cx="50" cy="24" rx="7" ry="13" fill="#a0b8ff" opacity="0.85"
                transform="rotate(240 50 50)"
              />
              <ellipse
                cx="50" cy="24" rx="7" ry="13" fill="#a0b8ff" opacity="0.85"
                transform="rotate(300 50 50)"
              />
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
            SSO 로그인
          </h2>

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
              disabled={isSubmitting}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {isSubmitting ? '로그인 중...' : '로그인'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
          Cloudflare Zero Trust 보안 인증
        </p>
      </div>
    </div>
  )
}

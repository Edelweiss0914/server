'use client'

import { useEffect, useReducer } from 'react'
import { useAuth } from '@/lib/useAuth'
import { LoginForm } from '@/components/auth/LoginForm'
import { Footer } from '@/components/layout/Footer'
import { SERVICES } from '@/lib/services'
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
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  const { isOpen, recordConsent, openModal, closeModal } = usePrivacyConsent()

  const featuredServices = SERVICES.filter((s) => s.featured === true)
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

  const isAdmin = user.role === 'admin'

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-950">
      {/* Top bar */}
      <div className="w-full border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <svg
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-8 h-8 shrink-0"
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
            <div>
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-wide">
                CHEEZE
              </span>
              <span className="hidden sm:inline text-sm text-zinc-500 dark:text-zinc-400 ml-2">
                통합 업무 플랫폼
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-600 dark:text-zinc-300">{user.name}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ${
                isAdmin
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                  : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              {isAdmin ? 'ADMIN' : 'MEMBER'}
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

      <main className="w-full max-w-6xl mx-auto px-4 flex-1 py-8 flex flex-col gap-8">

        {/* Section 1: Welcome banner */}
        <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 dark:from-blue-700 dark:to-blue-600 px-8 py-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {user.name}님, 안녕하세요
            </h1>
            <p className="text-blue-100 mt-1 text-sm">
              CHEEZE 통합 업무 플랫폼에 오신 것을 환영합니다
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0">
            <span className="text-blue-100 text-sm">{formatDate()}</span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                isAdmin
                  ? 'bg-white/20 text-white'
                  : 'bg-white/15 text-blue-50'
              }`}
            >
              {isAdmin ? '관리자' : '멤버'}
            </span>
          </div>
        </div>

        {/* Section 2: Status overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Active services */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 shadow shadow-green-400/50" />
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">활성 서비스</p>
            </div>
            <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">{activeServiceCount}</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">서비스 운영 중</p>
          </div>

          {/* Security level */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">보안 등급</p>
            </div>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">Zero Trust</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">최고 보안 수준</p>
          </div>

          {/* Uptime */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">인프라 가동률</p>
            </div>
            <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">99.9%</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">SLA 기준 달성</p>
          </div>

          {/* Security auth */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-orange-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">보안 인증</p>
            </div>
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Cloudflare Access</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">OTP 이중 인증</p>
          </div>
        </div>

        {/* Section 3: Service cards */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-4">
            업무 서비스
          </h2>
          <div className="flex flex-col gap-3">
            {featuredServices.map((service) => {
              const isExternal = service.url.startsWith('http')
              const statusLabel = service.onDemand ? '온디맨드' : '운영 중'
              const statusClass = service.onDemand
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                : 'bg-green-50 dark:bg-green-950/50 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800'

              return (
                <div
                  key={service.id}
                  className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
                  style={{ borderLeftWidth: '4px', borderLeftColor: service.color }}
                >
                  <div className="flex items-center gap-5 px-6 py-5">
                    {/* Icon */}
                    <div
                      className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: service.bgColor }}
                      dangerouslySetInnerHTML={{ __html: service.icon }}
                      aria-hidden="true"
                    />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                          {service.nameKo}
                        </span>
                        <span className="text-sm text-zinc-400 dark:text-zinc-500">
                          {service.name}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed line-clamp-2">
                        {service.description}
                      </p>
                    </div>

                    {/* Right: status + button */}
                    <div className="flex flex-col items-end gap-3 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`}>
                          {statusLabel}
                        </span>
                        <span className="flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                          <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor"><path d="M8 1a7 7 0 110 14A7 7 0 018 1zm2.85 4.65a.75.75 0 010 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 111.06-1.06l.97.97 2.97-2.97a.75.75 0 011.06 0z"/></svg>
                          SSO
                        </span>
                      </div>
                      <a
                        href={service.url}
                        {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                        className="rounded-lg px-4 py-1.5 text-sm font-medium text-white transition-colors"
                        style={{ backgroundColor: service.color }}
                      >
                        접속
                      </a>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Section 4: Quick actions */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-4">
            빠른 이동
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Admin console — admin only */}
            {isAdmin && (
              <a
                href="/admin"
                className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 p-5 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors group"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <p className="text-sm font-bold text-blue-900 dark:text-blue-100 group-hover:text-blue-700 dark:group-hover:text-blue-300">
                  관리자 콘솔
                </p>
                <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-1">
                  시스템 설정 및 사용자 관리
                </p>
                <span className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-blue-600 dark:text-blue-400">
                  바로가기
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </a>
            )}

            {/* Learn */}
            <a
              href="/learn"
              className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 p-5 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors group"
            >
              <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-violet-900 dark:text-violet-100 group-hover:text-violet-700 dark:group-hover:text-violet-300">
                교육 플랫폼
              </p>
              <p className="text-xs text-violet-600/70 dark:text-violet-400/70 mt-1">
                자격증 CBT · 직원 교육 콘텐츠
              </p>
              <span className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-violet-600 dark:text-violet-400">
                바로가기
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
            </a>

            {/* Servers */}
            <a
              href="/servers"
              className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 p-5 hover:bg-zinc-100 dark:hover:bg-zinc-700/60 transition-colors group"
            >
              <div className="w-10 h-10 rounded-xl bg-zinc-600 dark:bg-zinc-500 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                  <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                  <line x1="6" y1="6" x2="6.01" y2="6" />
                  <line x1="6" y1="18" x2="6.01" y2="18" />
                </svg>
              </div>
              <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100 group-hover:text-zinc-600 dark:group-hover:text-zinc-300">
                서비스 관리
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                온디맨드 서버 시작 · 종료
              </p>
              <span className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                바로가기
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
            </a>
          </div>
        </section>

        {/* Section 5: System info footer */}
        <div className="rounded-xl bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/50 px-6 py-4 text-center">
          <p className="text-xs text-zinc-400 dark:text-zinc-500 tracking-wide">
            Zero Trust 보안 아키텍처&nbsp;&nbsp;|&nbsp;&nbsp;Cloudflare Tunnel&nbsp;&nbsp;|&nbsp;&nbsp;자동 SSL&nbsp;&nbsp;|&nbsp;&nbsp;감사 로그
          </p>
        </div>

      </main>

      <Footer onPrivacyClick={openModal} />
      {isOpen && (
        <PrivacyPolicyModal onConsent={recordConsent} onDismiss={closeModal} />
      )}
    </div>
  )
}

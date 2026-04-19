'use client'

import { useEffect, useCallback, useId } from 'react'

interface PrivacyPolicyModalProps {
  onConsent: () => void
  onDismiss: () => void
}

export function PrivacyPolicyModal({ onConsent, onDismiss }: PrivacyPolicyModalProps) {
  const titleId = useId()

  // ESC to dismiss
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
      }
    },
    [onDismiss]
  )

  // Lock body scroll and attach ESC listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = prev
    }
  }, [handleKeyDown])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onDismiss}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 shrink-0 border-b border-zinc-100 dark:border-zinc-700">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
            {/* Shield icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id={titleId}
              className="text-base font-semibold text-zinc-900 dark:text-zinc-50 leading-snug"
            >
              개인정보 처리방침
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              시행일: 2025년 1월 1일 &nbsp;·&nbsp; 버전 1.0
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
            aria-label="닫기"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 text-sm text-zinc-700 dark:text-zinc-300 space-y-5">

          <p className="text-zinc-500 dark:text-zinc-400 text-xs leading-relaxed">
            edelweiss0297.cloud(이하 "서비스")는 개인정보보호법에 따라 이용자의 개인정보를 보호하고,
            이와 관련한 고충을 신속하게 처리할 수 있도록 다음과 같이 개인정보 처리방침을 수립·공개합니다.
          </p>

          {/* Section 1 */}
          <section>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2 flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">1</span>
              수집하는 개인정보 항목
            </h3>
            <div className="ml-6.5 space-y-1.5 pl-1">
              <div className="flex gap-2">
                <span className="text-zinc-400 dark:text-zinc-500 shrink-0">·</span>
                <span><strong className="text-zinc-800 dark:text-zinc-200">서버 접속 시 자동 수집:</strong> IP 주소, 접속 시각, 브라우저 정보 등 서버 접속 로그</span>
              </div>
              <div className="flex gap-2">
                <span className="text-zinc-400 dark:text-zinc-500 shrink-0">·</span>
                <span><strong className="text-zinc-800 dark:text-zinc-200">서버 대여 신청 시 수집:</strong> 이름(닉네임), 연락 수단(Discord ID 등 이용자 제공 정보)</span>
              </div>
            </div>
          </section>

          {/* Section 2 */}
          <section>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2 flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">2</span>
              수집 및 이용 목적
            </h3>
            <div className="ml-6.5 space-y-1.5 pl-1">
              <div className="flex gap-2">
                <span className="text-zinc-400 dark:text-zinc-500 shrink-0">·</span>
                <span>서비스 운영 및 안정성 확보, 보안 사고 대응</span>
              </div>
              <div className="flex gap-2">
                <span className="text-zinc-400 dark:text-zinc-500 shrink-0">·</span>
                <span>서버 대여 신청 접수 및 처리, 이용자 문의 응대</span>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2 flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">3</span>
              보유 및 이용 기간
            </h3>
            <div className="ml-6.5 space-y-1.5 pl-1">
              <div className="flex gap-2">
                <span className="text-zinc-400 dark:text-zinc-500 shrink-0">·</span>
                <span><strong className="text-zinc-800 dark:text-zinc-200">서버 접속 로그:</strong> 수집일로부터 1년 후 파기</span>
              </div>
              <div className="flex gap-2">
                <span className="text-zinc-400 dark:text-zinc-500 shrink-0">·</span>
                <span><strong className="text-zinc-800 dark:text-zinc-200">대여 신청 정보:</strong> 신청 처리 완료 후 1년 후 파기</span>
              </div>
              <div className="flex gap-2">
                <span className="text-zinc-400 dark:text-zinc-500 shrink-0">·</span>
                <span>관계 법령에 따라 보존 의무가 있는 경우 해당 기간 동안 보존</span>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2 flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">4</span>
              개인정보의 제3자 제공
            </h3>
            <div className="ml-6.5 space-y-2 pl-1">
              <p>원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다. 다만, 서비스 운영을 위해 아래와 같이 제한적으로 제공합니다.</p>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-700/50">
                      <th className="text-left px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400 w-1/3">수탁자</th>
                      <th className="text-left px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">위탁 목적 및 제공 항목</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-zinc-200 dark:border-zinc-700">
                      <td className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">Discord Inc.</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">대여 신청 내용을 운영자에게 웹훅으로 전달 (이름·연락 수단·신청 내용)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2 flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">5</span>
              이용자의 권리
            </h3>
            <div className="ml-6.5 space-y-1.5 pl-1">
              <p>이용자는 언제든지 다음의 권리를 행사할 수 있습니다.</p>
              <div className="flex gap-2">
                <span className="text-zinc-400 dark:text-zinc-500 shrink-0">·</span>
                <span>개인정보 열람, 정정, 삭제, 처리정지 요구</span>
              </div>
              <div className="flex gap-2">
                <span className="text-zinc-400 dark:text-zinc-500 shrink-0">·</span>
                <span>동의 철회는 아래 연락처를 통해 언제든지 가능하며, 일부 서비스 이용이 제한될 수 있습니다.</span>
              </div>
              <div className="flex gap-2 mt-1">
                <span className="text-zinc-400 dark:text-zinc-500 shrink-0">·</span>
                <span><strong className="text-zinc-800 dark:text-zinc-200">문의:</strong> 운영자 Discord (서비스 내 안내 참조)</span>
              </div>
            </div>
          </section>

          <p className="text-zinc-400 dark:text-zinc-500 text-xs pt-1">
            본 방침은 변경될 수 있으며, 변경 시 버전 번호가 갱신되고 재동의가 필요합니다.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 shrink-0 border-t border-zinc-100 dark:border-zinc-700">
          <button
            type="button"
            onClick={onDismiss}
            className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700"
          >
            나중에 보기
          </button>
          <button
            type="button"
            onClick={onConsent}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 px-5 py-2 text-sm font-medium text-white transition-colors"
          >
            동의합니다
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface TokenDialogProps {
  serviceName: string
  action: string
  onConfirm: (token: string) => void
  onCancel: () => void
}

export function TokenDialog({
  serviceName,
  action,
  onConfirm,
  onCancel,
}: TokenDialogProps) {
  const [value, setValue] = useState('')
  const [visible, setVisible] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        onConfirm(value.trim())
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    },
    [value, onConfirm, onCancel]
  )

  const actionLabel = action === 'start' ? '시작' : action === 'stop' ? '종료' : action

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />
      {/* dialog */}
      <div className="relative w-full max-w-sm mx-4 bg-white dark:bg-zinc-800 rounded-xl shadow-2xl p-6">
        {/* header */}
        <div className="flex items-start gap-3 mb-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
            <svg
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
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              제어 토큰 확인
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {serviceName} {actionLabel}
            </p>
          </div>
        </div>

        {/* input */}
        <div className="relative mb-5">
          <input
            ref={inputRef}
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="토큰을 입력하세요"
            autoComplete="current-password"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 px-3 py-2.5 pr-10 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            aria-label="토큰 표시/숨김"
          >
            {visible ? (
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
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
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
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </button>
        </div>

        {/* footer */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm(value.trim())}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}

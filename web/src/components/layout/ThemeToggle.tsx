'use client'

import { useEffect, useReducer } from 'react'

export function ThemeToggle() {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    // Sync React state with the class that the inline script already set
    forceUpdate()
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('edelweiss-theme')) {
        document.documentElement.classList.toggle('dark', e.matches)
        forceUpdate()
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  function toggle() {
    const isDark = document.documentElement.classList.contains('dark')
    const next = !isDark
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('edelweiss-theme', next ? 'dark' : 'light')
    forceUpdate()
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="fixed top-4 right-4 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 shadow-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
      aria-label="테마 전환"
      suppressHydrationWarning
    >
      {/* Sun icon — visible in dark mode */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="hidden dark:block text-zinc-300"
      >
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
      {/* Moon icon — visible in light mode */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="block dark:hidden text-zinc-600"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  )
}

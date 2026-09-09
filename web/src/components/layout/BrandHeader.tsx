export function BrandHeader() {
  return (
    <header className="flex flex-col items-center gap-3 pt-12 pb-6">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-blue-500/10 blur-2xl scale-150" />
        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Edelweiss 로고"
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
          개인 서버 홈
        </p>
      </div>
    </header>
  )
}

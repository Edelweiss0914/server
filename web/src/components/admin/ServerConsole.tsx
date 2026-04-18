'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export interface ServerConsoleProps {
  services: Array<{ id: string; display_name?: string }>
}

const CONSOLE_TAIL_INITIAL = 200
const CONSOLE_MAX_LINES = 2000
const CONSOLE_RENDER_MAX = 500
const CONSOLE_POLL_MS = 3000

type LogLevel = 'error' | 'warn' | 'debug' | 'info' | ''

interface ConsoleLine {
  text: string
  level: LogLevel
  isNew: boolean
  isCommand?: boolean
}

function classifyLine(text: string): LogLevel {
  if (!text) return ''
  const t = text.toLowerCase()
  if (/\[(error|fatal|severe)\]|: (error|fatal|severe) /.test(t)) return 'error'
  if (/\[warn(ing)?\]|: warn(ing)? /.test(t)) return 'warn'
  if (/\[debug\]|: debug /.test(t)) return 'debug'
  if (/\[info\]|: info /.test(t)) return 'info'
  return ''
}

function transformCommand(command: string): string {
  const sayMatch = command.match(/^say\s+(.+)$/i)
  if (sayMatch) {
    const msg = sayMatch[1].replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return `tellraw @a {"text":"[관리자] ${msg}","color":"gold"}`
  }
  return command
}

function lineColorClass(level: LogLevel, isCommand?: boolean): string {
  if (isCommand) return 'text-[#3fb950]'
  switch (level) {
    case 'error': return 'text-[#f85149]'
    case 'warn':  return 'text-[#e3b341]'
    case 'debug': return 'text-[#484f58]'
    case 'info':  return 'text-[#79c0ff]'
    default:      return ''
  }
}

export function ServerConsole({ services }: ServerConsoleProps) {
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null)
  const [consoleBuffer, setConsoleBuffer] = useState<Record<string, ConsoleLine[]>>({})
  const [consoleLinesOffset, setConsoleLinesOffset] = useState<Record<string, number>>({})
  const [autoScroll, setAutoScroll] = useState(true)
  const [showScrollHint, setShowScrollHint] = useState(false)
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [inputValue, setInputValue] = useState('')
  const [inputDisabled, setInputDisabled] = useState(true)
  const [isLive, setIsLive] = useState(false)
  const [statusLabel, setStatusLabel] = useState('-')

  const terminalRef = useRef<HTMLDivElement>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoScrollRef = useRef(autoScroll)
  autoScrollRef.current = autoScroll

  // Auto-select first service on mount
  useEffect(() => {
    if (services.length > 0 && !activeServiceId) {
      setActiveServiceId(services[0].id)
    }
  }, [services, activeServiceId])

  const schedulePoll = useCallback((serviceId: string, offsetRef: React.MutableRefObject<Record<string, number>>) => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    pollTimerRef.current = setTimeout(async () => {
      const offset = offsetRef.current[serviceId] || 0
      try {
        const res = await fetch(`/api/admin/services/${serviceId}/console?offset=${offset}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const newLines: string[] = data.lines || []
        const total: number = data.total_lines || 0

        if (total < offset) {
          // Log rotation detected — re-fetch initial
          offsetRef.current[serviceId] = 0
          setConsoleLinesOffset((prev) => ({ ...prev, [serviceId]: 0 }))
          setConsoleBuffer((prev) => ({ ...prev, [serviceId]: [] }))
          return
        }

        if (newLines.length > 0) {
          const mapped: ConsoleLine[] = newLines.map((t) => ({ text: t, level: classifyLine(t), isNew: true }))
          setConsoleBuffer((prev) => {
            const existing = prev[serviceId] || []
            const combined = [...existing, ...mapped]
            const trimmed = combined.length > CONSOLE_MAX_LINES
              ? combined.slice(combined.length - CONSOLE_MAX_LINES)
              : combined
            return { ...prev, [serviceId]: trimmed }
          })
          offsetRef.current[serviceId] = total
          setConsoleLinesOffset((prev) => ({ ...prev, [serviceId]: total }))
        }

        setIsLive(true)
        setStatusLabel(`${total}줄 · ${new Date().toLocaleTimeString('ko-KR')}`)
      } catch {
        setIsLive(false)
        setStatusLabel('연결 실패')
      }
      schedulePoll(serviceId, offsetRef)
    }, CONSOLE_POLL_MS)
  }, [])

  // Keep an up-to-date ref for offsets (avoids stale closure in poll)
  const offsetsRef = useRef<Record<string, number>>({})
  useEffect(() => {
    offsetsRef.current = consoleLinesOffset
  }, [consoleLinesOffset])

  const fetchInitial = useCallback(async (serviceId: string) => {
    setIsLive(false)
    setInputDisabled(true)
    setStatusLabel('-')
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/console?tail=${CONSOLE_TAIL_INITIAL}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const lines: string[] = data.lines || []
      const total: number = data.total_lines || 0
      const mapped: ConsoleLine[] = lines.map((t) => ({ text: t, level: classifyLine(t), isNew: false }))
      setConsoleBuffer((prev) => ({ ...prev, [serviceId]: mapped }))
      offsetsRef.current[serviceId] = total
      setConsoleLinesOffset((prev) => ({ ...prev, [serviceId]: total }))
      setIsLive(true)
      setStatusLabel(`${total}줄`)
      setInputDisabled(false)
    } catch {
      setConsoleBuffer((prev) => ({
        ...prev,
        [serviceId]: [{ text: '로드 실패. 잠시 후 다시 시도합니다.', level: 'error', isNew: false }],
      }))
      setIsLive(false)
      setStatusLabel('연결 실패')
    }
    schedulePoll(serviceId, offsetsRef)
  }, [schedulePoll])

  // Switch tabs
  const handleTabClick = useCallback((serviceId: string) => {
    if (serviceId === activeServiceId) return
    if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null }
    setActiveServiceId(serviceId)
    setIsLive(false)
    setStatusLabel('-')
    setInputDisabled(true)
    setAutoScroll(true)
    setShowScrollHint(false)
  }, [activeServiceId])

  // Fetch when active service changes
  useEffect(() => {
    if (!activeServiceId) return
    if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null }
    if (consoleBuffer[activeServiceId]) {
      // Already have buffer — resume polling
      schedulePoll(activeServiceId, offsetsRef)
      setInputDisabled(false)
    } else {
      fetchInitial(activeServiceId)
    }
    return () => {
      if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServiceId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [])

  // Auto-scroll when buffer changes
  useEffect(() => {
    const el = terminalRef.current
    if (!el) return
    if (autoScrollRef.current) {
      el.scrollTop = el.scrollHeight
      setShowScrollHint(false)
    }
  }, [consoleBuffer, activeServiceId])

  const handleScroll = useCallback(() => {
    const el = terminalRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distFromBottom < 60) {
      setAutoScroll(true)
      setShowScrollHint(false)
    } else {
      setAutoScroll(false)
      setShowScrollHint(true)
    }
  }, [])

  const scrollToBottom = useCallback(() => {
    const el = terminalRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    setAutoScroll(true)
    setShowScrollHint(false)
  }, [])

  const handleClear = useCallback(() => {
    if (!activeServiceId) return
    setConsoleBuffer((prev) => ({
      ...prev,
      [activeServiceId]: [{ text: '지워졌습니다.', level: '', isNew: false }],
    }))
  }, [activeServiceId])

  const sendCommand = useCallback(async () => {
    if (!activeServiceId || !inputValue.trim()) return
    const raw = inputValue.trim()
    const actualCommand = transformCommand(raw)

    // Echo in terminal
    setConsoleBuffer((prev) => ({
      ...prev,
      [activeServiceId]: [
        ...(prev[activeServiceId] || []),
        { text: `> ${raw}`, level: '', isNew: true, isCommand: true },
      ],
    }))

    // Save history
    setCommandHistory((prev) => {
      const updated = prev[0] !== raw ? [raw, ...prev] : prev
      return updated.slice(0, 50)
    })
    setHistoryIndex(-1)
    setInputValue('')
    setInputDisabled(true)

    try {
      const res = await fetch(`/api/admin/services/${activeServiceId}/console`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: actualCommand }),
      })
      const data = await res.json()
      if (data.response) {
        const responseLines: ConsoleLine[] = data.response
          .split('\n')
          .filter((l: string) => l.trim())
          .map((l: string) => ({ text: l, level: classifyLine(l), isNew: true }))
        setConsoleBuffer((prev) => ({
          ...prev,
          [activeServiceId]: [...(prev[activeServiceId] || []), ...responseLines],
        }))
      } else if (!data.success) {
        const errMsg = data.message || data.error || '알 수 없는 오류'
        setConsoleBuffer((prev) => ({
          ...prev,
          [activeServiceId]: [
            ...(prev[activeServiceId] || []),
            { text: `오류: ${errMsg}`, level: 'error', isNew: true },
          ],
        }))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setConsoleBuffer((prev) => ({
        ...prev,
        [activeServiceId]: [
          ...(prev[activeServiceId] || []),
          { text: `전송 실패: ${msg}`, level: 'error', isNew: true },
        ],
      }))
    }

    setInputDisabled(false)
  }, [activeServiceId, inputValue])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      sendCommand()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHistoryIndex((prev) => {
        const next = Math.min(prev + 1, commandHistory.length - 1)
        if (commandHistory[next] !== undefined) setInputValue(commandHistory[next])
        return next
      })
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHistoryIndex((prev) => {
        const next = Math.max(prev - 1, -1)
        setInputValue(next === -1 ? '' : (commandHistory[next] ?? ''))
        return next
      })
    }
  }, [commandHistory, sendCommand])

  const activeLines = activeServiceId ? (consoleBuffer[activeServiceId] || []) : []
  const renderedLines = activeLines.slice(-CONSOLE_RENDER_MAX)

  return (
    <div className="rounded-xl overflow-hidden border border-[#30363d]">
      {/* Titlebar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#161b22] border-b border-[#30363d] min-h-[36px] flex-wrap sm:flex-nowrap">
        {/* macOS dots — hidden on mobile */}
        <div className="hidden sm:flex gap-[5px] mr-1 shrink-0" aria-hidden="true">
          <span className="w-[11px] h-[11px] rounded-full bg-[#ff5f57]" />
          <span className="w-[11px] h-[11px] rounded-full bg-[#febc2e]" />
          <span className="w-[11px] h-[11px] rounded-full bg-[#28c840]" />
        </div>

        {/* Tab list */}
        <div className="flex gap-0.5 flex-1 overflow-x-auto overflow-y-hidden order-3 sm:order-none w-full sm:w-auto scrollbar-thin pb-0.5 sm:pb-0">
          {services.length === 0 ? (
            <span className="text-[#484f58] italic text-[0.74rem] px-1">서비스 없음</span>
          ) : (
            services.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleTabClick(s.id)}
                className={[
                  'shrink-0 text-[0.76rem] px-[11px] py-[3px] rounded cursor-pointer whitespace-nowrap transition-colors duration-[120ms] font-sans',
                  activeServiceId === s.id
                    ? 'bg-[#21262d] text-[#e6edf3] font-semibold'
                    : 'bg-transparent text-[#8b949e] hover:bg-[#21262d] hover:text-[#c9d1d9]',
                ].join(' ')}
              >
                {s.display_name || s.id}
              </button>
            ))
          )}
        </div>

        {/* Status + clear */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <span
            className={[
              'w-2 h-2 rounded-full shrink-0',
              isLive
                ? 'bg-[#3fb950] shadow-[0_0_5px_#3fb950aa] animate-pulse'
                : 'bg-[#30363d]',
            ].join(' ')}
          />
          <span className="text-[0.7rem] text-[#8b949e] font-mono">{statusLabel}</span>
          <button
            type="button"
            onClick={handleClear}
            className="bg-transparent border border-[#30363d] text-[#8b949e] text-[0.7rem] px-2 py-[2px] rounded-[3px] font-mono cursor-pointer transition-colors duration-[120ms] hover:border-[#8b949e] hover:text-[#c9d1d9]"
          >
            지우기
          </button>
        </div>
      </div>

      {/* Terminal */}
      <div className="relative">
        <div
          ref={terminalRef}
          onScroll={handleScroll}
          className="bg-[#0d1117] text-[#c9d1d9] font-mono text-[0.7rem] sm:text-[0.775rem] leading-relaxed p-3 h-[280px] sm:h-[380px] overflow-y-auto overflow-x-auto whitespace-pre"
          style={{
            fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', 'Menlo', monospace",
            scrollbarWidth: 'thin',
            scrollbarColor: '#30363d #0d1117',
          }}
        >
          {renderedLines.length === 0 ? (
            <span className="text-[#484f58] italic whitespace-normal">
              {activeServiceId ? '로그 없음' : '서비스를 선택하면 로그가 표시됩니다.'}
            </span>
          ) : (
            renderedLines.map((line, i) => (
              <span
                key={i}
                className={[
                  'block min-h-[1.2em]',
                  line.isNew ? 'animate-[console-fadein_0.14s_ease-out_forwards]' : '',
                  lineColorClass(line.level, line.isCommand),
                ].filter(Boolean).join(' ')}
              >
                {line.text}
              </span>
            ))
          )}
        </div>

        {/* Scroll hint */}
        {showScrollHint && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-2.5 right-5 bg-[#21262d] border border-[#30363d] text-[#8b949e] text-[0.7rem] px-2.5 py-[3px] rounded-[10px] cursor-pointer z-10 transition-colors duration-[120ms] hover:bg-[#30363d] hover:text-[#c9d1d9]"
          >
            ↓ 최신으로
          </button>
        )}
      </div>

      {/* Input bar */}
      <div
        className="flex items-center gap-2 px-3.5 py-1.5 bg-[#0d1117] border-t border-[#21262d]"
      >
        <span
          className="text-[#3fb950] shrink-0 select-none text-[0.775rem]"
          style={{ fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace" }}
        >
          $
        </span>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={inputDisabled}
          placeholder="명령어 입력  (예: say Hello, list, weather clear, give @a diamond 1)"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 bg-transparent border-none outline-none text-[#e6edf3] text-[0.775rem] disabled:opacity-40 placeholder-[#484f58]"
          style={{
            fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            caretColor: '#3fb950',
          }}
        />
        <button
          type="button"
          onClick={sendCommand}
          disabled={inputDisabled}
          className="shrink-0 bg-transparent border border-[#30363d] text-[#8b949e] text-[0.7rem] px-2.5 py-[2px] rounded-[3px] font-mono cursor-pointer transition-colors duration-[120ms] hover:enabled:border-[#3fb950] hover:enabled:text-[#3fb950] disabled:opacity-35 disabled:cursor-not-allowed"
        >
          전송
        </button>
      </div>

      {/* Keyframe for new line fade-in */}
      <style>{`
        @keyframes console-fadein {
          from { opacity: 0; transform: translateX(-3px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}

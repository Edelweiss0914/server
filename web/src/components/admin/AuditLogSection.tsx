'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { actionLabel, resultLabel, tokenLabel } from '@/lib/admin-labels'

interface AuditEntry {
  timestamp: string
  service_id: string
  action: string
  result: string
  token_label?: string
  token_id?: string
  remote_ip: string
}

interface AuditLogSectionProps {
  ipLabels: Record<string, string>
}

const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 25, 50, 100]

function fmtTs(ts: string): string {
  return new Date(ts).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function ResultBadge({ result }: { result: string }) {
  const label = resultLabel(result)
  const key = result?.toLowerCase()
  let cls = 'px-2 py-0.5 rounded-full text-xs font-bold '
  if (key === 'forwarded') {
    cls += 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400'
  } else if (key === 'rejected' || key === 'error') {
    cls += 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400'
  } else if (key === 'failed') {
    cls += 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-400'
  } else {
    cls += 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
  }
  return <span className={cls}>{label}</span>
}

function IpCell({ ip, ipLabels }: { ip: string; ipLabels: Record<string, string> }) {
  if (!ip) return <span>-</span>
  const name = ipLabels[ip]
  return (
    <span className="flex items-center gap-1.5 flex-wrap">
      <span className="font-mono text-xs">{ip}</span>
      {name && (
        <span className="px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
          {name}
        </span>
      )}
    </span>
  )
}

export function AuditLogSection({ ipLabels }: AuditLogSectionProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [auditPage, setAuditPage] = useState(5)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [newRowIds, setNewRowIds] = useState<Set<string>>(new Set())
  const knownTotalRef = useRef(0)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const loadInitial = useCallback(
    async (page: number) => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/audit?limit=${page}&offset=0`)
        if (!res.ok) return
        const data = await res.json()
        const total: number = data.total || 0
        const raw: AuditEntry[] = data.entries || []
        setTotal(total)
        knownTotalRef.current = total
        // Reverse so newest appears first
        setEntries(raw.slice().reverse())
        setOffset(raw.length)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/admin/audit?limit=${auditPage}&offset=${offset}`)
      if (!res.ok) return
      const data = await res.json()
      const newEntries: AuditEntry[] = data.entries || []
      setTotal(data.total || 0)
      // Append older entries at the bottom (no reversal needed for "load more")
      setEntries((prev) => [...prev, ...newEntries])
      setOffset((prev) => prev + newEntries.length)
    } finally {
      setLoadingMore(false)
    }
  }, [auditPage, offset])

  const pollNew = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/audit?limit=10&offset=0')
      if (!res.ok) return
      const data = await res.json()
      const newTotal: number = data.total || 0

      if (newTotal > knownTotalRef.current) {
        const raw: AuditEntry[] = data.entries || []
        const diff = Math.min(newTotal - knownTotalRef.current, raw.length)
        const newEntries = raw.slice(raw.length - diff).reverse()

        knownTotalRef.current = newTotal
        setTotal(newTotal)

        const ids = new Set(newEntries.map((e) => e.timestamp + e.remote_ip))
        setNewRowIds(ids)
        setEntries((prev) => [...newEntries, ...prev])
        setOffset((prev) => prev + diff)

        setTimeout(() => setNewRowIds(new Set()), 2500)
      }
    } catch {
      /* noop */
    }
  }, [])

  const scheduleAuditPoll = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    pollTimerRef.current = setTimeout(async () => {
      await pollNew()
      scheduleAuditPoll()
    }, 5000)
  }, [pollNew])

  useEffect(() => {
    loadInitial(auditPage).then(() => scheduleAuditPoll())
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const hasMore = offset < total

  function handlePageSizeSelect(size: number) {
    setDropdownOpen(false)
    setAuditPage(size)
    setEntries([])
    setOffset(0)
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    loadInitial(size).then(() => scheduleAuditPoll())
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h2 className="text-base font-bold text-zinc-800 dark:text-zinc-100">감사 로그</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">전체 {total}건</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">더보기 단위</span>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <span>{auditPage}</span>
                <span className="text-zinc-400">▼</span>
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 z-10 min-w-[60px] border border-zinc-200 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 shadow-lg overflow-hidden">
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => handlePageSizeSelect(size)}
                      className={`w-full px-3 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 ${size === auditPage ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-zinc-700 dark:text-zinc-300'}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {['시각', '서비스', '액션', '결과', '토큰', 'IP'].map((h) => (
                <th
                  key={h}
                  className="px-3.5 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3.5 py-4 text-center text-sm text-zinc-400">
                  불러오는 중...
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3.5 py-4 text-center text-sm text-zinc-400">
                  감사 로그 없음
                </td>
              </tr>
            ) : (
              entries.map((e, i) => {
                const rowId = e.timestamp + e.remote_ip
                const isNew = newRowIds.has(rowId)
                return (
                  <tr
                    key={`${rowId}-${i}`}
                    className={`${isNew ? 'animate-[audit-flash_2s_ease-out]' : ''} border-b border-zinc-100 dark:border-zinc-800 last:border-0`}
                  >
                    <td className="px-3.5 py-2.5 text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                      {fmtTs(e.timestamp)}
                    </td>
                    <td className="px-3.5 py-2.5 text-sm text-zinc-700 dark:text-zinc-300">
                      {e.service_id || '-'}
                    </td>
                    <td className="px-3.5 py-2.5 text-sm text-zinc-700 dark:text-zinc-300">
                      {actionLabel(e.action)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <ResultBadge result={e.result} />
                    </td>
                    <td className="px-3.5 py-2.5 text-xs text-zinc-600 dark:text-zinc-400 max-w-[180px]">
                      {tokenLabel(e)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <IpCell ip={e.remote_ip} ipLabels={ipLabels} />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="px-4 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            {loadingMore ? '불러오는 중...' : '더 보기'}
          </button>
        </div>
      )}
    </section>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'

interface DiskInfo {
  drive: string
  total_gb: number
  used_gb: number
  free_gb: number
  percent: number
}

interface SystemResources {
  cpu?: { percent: number | null; error?: string }
  memory?: { total_gb: number; used_gb: number; percent: number; error?: string }
  disk?: DiskInfo[] | { error: string }
}

function usageColor(percent: number): string {
  if (percent >= 90) return 'bg-red-500'
  if (percent >= 70) return 'bg-amber-500'
  return 'bg-green-500'
}

function UsageBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1">
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <div className="h-2.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${usageColor(percent)}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  )
}

export function MonitoringTab() {
  const [data, setData] = useState<SystemResources | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/system')
      if (res.ok) {
        setData(await res.json())
        setError(null)
      } else {
        setError('백엔드 연결 실패')
      }
    } catch {
      setError('네트워크 오류')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, 10_000)
    return () => clearInterval(timer)
  }, [fetchData])

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">불러오는 중...</p>
  }

  if (error && !data) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
        {error}
      </div>
    )
  }

  if (!data) return null

  const disks = Array.isArray(data.disk) ? data.disk : []

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-zinc-400 dark:text-zinc-500">Backend PC 리소스 · 10초 폴링</p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* CPU */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-3">CPU</h3>
          {data.cpu?.error ? (
            <p className="text-xs text-red-500">{data.cpu.error}</p>
          ) : (
            <UsageBar percent={data.cpu?.percent ?? 0} label="사용률" />
          )}
        </div>

        {/* Memory */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-3">메모리</h3>
          {data.memory?.error ? (
            <p className="text-xs text-red-500">{data.memory.error}</p>
          ) : (
            <>
              <UsageBar percent={data.memory?.percent ?? 0} label="사용률" />
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
                {data.memory?.used_gb ?? 0} / {data.memory?.total_gb ?? 0} GB
              </p>
            </>
          )}
        </div>
      </div>

      {/* Disk */}
      {disks.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-3">디스크</h3>
          <div className="flex flex-col gap-3">
            {disks.map((d) => (
              <div key={d.drive}>
                <UsageBar percent={d.percent} label={`${d.drive} (${d.used_gb} / ${d.total_gb} GB)`} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { stateLabel, stateColorClass } from '@/lib/admin-labels'

export interface AdminService {
  id: string
  display_name: string
  state: string
  process_running: boolean
  ready: boolean
  player_count?: number | null
  message?: string
}

const NORMAL_POLL_MS = 10_000
const ACTIVE_POLL_MS = 2_000

function isTransitioning(state: string): boolean {
  return state === 'starting' || state === 'stopping' || state === 'waking'
}

interface Props {
  services: AdminService[]
  onServicesUpdate: (services: AdminService[]) => void
}

export function ServiceStatusGrid({ services, onServicesUpdate }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/status')
      if (!res.ok) return
      const data = await res.json()
      onServicesUpdate(data.services ?? [])
    } catch {
      /* noop */
    }
  }, [onServicesUpdate])

  const hasTransition = useCallback(() => {
    return services.some((s) => isTransitioning(s.state))
  }, [services])

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      await fetchServices()
      scheduleRefresh()
    }, hasTransition() ? ACTIVE_POLL_MS : NORMAL_POLL_MS)
  }, [fetchServices, hasTransition])

  useEffect(() => {
    fetchServices().then(() => scheduleRefresh())
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scheduleRefresh()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [scheduleRefresh])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchServices().then(() => scheduleRefresh())
      }
    }
    const onFocus = () => {
      fetchServices().then(() => scheduleRefresh())
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [fetchServices, scheduleRefresh])

  if (services.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">서비스 정보를 불러오는 중...</p>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {services.map((service) => (
        <div
          key={service.id}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex flex-col gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-zinc-900 dark:text-zinc-50 text-sm truncate">
              {service.display_name || service.id}
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
              <span className={`inline-block w-2 h-2 rounded-full ${stateColorClass(service.state)}`} />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {stateLabel(service.state)}
              </span>
            </span>
          </div>

          <div className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <div className="flex justify-between">
              <span>프로세스</span>
              <span className={service.process_running ? 'text-green-600 dark:text-green-400' : ''}>
                {service.process_running ? '실행 중' : '미실행'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>준비 상태</span>
              <span className={service.ready ? 'text-green-600 dark:text-green-400' : ''}>
                {service.ready ? '준비됨' : '준비 안 됨'}
              </span>
            </div>
            {service.player_count != null && (
              <div className="flex justify-between">
                <span>플레이어</span>
                <span>{service.player_count}명</span>
              </div>
            )}
          </div>

          {service.message && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 border-t border-zinc-100 dark:border-zinc-800 pt-2 mt-1">
              {service.message}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

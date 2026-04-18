'use client'

import { useCallback } from 'react'
import { stateLabel, stateColorClass } from '@/lib/admin-labels'
import type { AdminService } from './ServiceStatusGrid'

function isTransitioning(state: string): boolean {
  return state === 'starting' || state === 'stopping' || state === 'waking'
}

interface Props {
  services: AdminService[]
  onServicesUpdate: (services: AdminService[]) => void
}

export function ServiceControlGrid({ services, onServicesUpdate }: Props) {
  const handleAction = useCallback(
    async (service: AdminService, action: 'start' | 'stop') => {
      const label = action === 'start' ? '시작' : '종료'
      if (!confirm(`${service.display_name || service.id} 서비스를 ${label}하시겠습니까?`)) return

      // Optimistic UI update
      const optimisticState = action === 'start' ? 'waking' : 'stopping'
      onServicesUpdate(
        services.map((s) =>
          s.id === service.id ? { ...s, state: optimisticState } : s
        )
      )

      try {
        const res = await fetch(`/api/admin/services/${service.id}/${action}`, {
          method: 'POST',
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          const msg = String(data.message || data.error || `요청 실패 (${res.status})`)
          onServicesUpdate(
            services.map((s) =>
              s.id === service.id ? { ...s, state: 'error', message: msg } : s
            )
          )
          return
        }
      } catch {
        onServicesUpdate(
          services.map((s) =>
            s.id === service.id
              ? { ...s, state: 'error', message: '네트워크 오류가 발생했습니다.' }
              : s
          )
        )
      }

      // Re-fetch after action
      try {
        const res = await fetch('/api/admin/status')
        if (res.ok) {
          const data = await res.json()
          onServicesUpdate(data.services ?? [])
        }
      } catch {
        /* noop */
      }
    },
    [services, onServicesUpdate]
  )

  if (services.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">서비스 정보를 불러오는 중...</p>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {services.map((service) => {
        const transitioning = isTransitioning(service.state)
        const canStart = service.state === 'offline' || service.state === 'error'
        const canStop =
          service.state === 'running' ||
          service.state === 'starting' ||
          service.state === 'waking' ||
          service.state === 'stopping'

        return (
          <div
            key={service.id}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex flex-col gap-3"
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

            {service.player_count != null && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                플레이어 {service.player_count}명
              </p>
            )}

            <div className="flex gap-2 mt-auto">
              <button
                onClick={() => handleAction(service, 'start')}
                disabled={!canStart || transitioning}
                className="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                시작
              </button>
              <button
                onClick={() => handleAction(service, 'stop')}
                disabled={!canStop || transitioning}
                className="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                종료
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

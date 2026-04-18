'use client'

import type { ServiceConfig, ServiceState } from './ServersGrid'

interface ServerCardProps {
  service: ServiceConfig
  state: ServiceState
  onAction: (serviceId: string, action: string) => void
}

const STATE_LABELS: Record<string, string> = {
  offline: '꺼짐',
  waking: '깨우는 중',
  starting: '켜는 중',
  running: '가동 중',
  stopping: '종료 중',
  error: '오류',
}

const STATE_BADGE_CLASSES: Record<string, string> = {
  running:
    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  offline: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400',
  starting:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  waking: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  stopping:
    'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
}

function statusMessage(state: string, message?: string): string {
  if (message) return message
  if (state === 'running') return '접속 준비가 끝났습니다.'
  if (state === 'offline') return '필요할 때만 백엔드 PC를 깨워서 실행합니다.'
  return '백엔드 상태를 확인하는 중입니다.'
}

export function ServerCard({ service, state, onAction }: ServerCardProps) {
  const currentState = state.state || 'offline'
  const busy =
    currentState === 'starting' ||
    currentState === 'waking' ||
    currentState === 'stopping'
  const canStart = currentState === 'offline' || currentState === 'error'
  const canStop =
    currentState === 'running' ||
    currentState === 'starting' ||
    currentState === 'waking' ||
    currentState === 'stopping'

  return (
    <article
      className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 p-5 shadow-sm hover:shadow-md transition-shadow"
      style={
        {
          '--service-color': service.color,
        } as React.CSSProperties
      }
    >
      {/* head */}
      <div className="flex items-start gap-3.5 mb-3">
        {/* icon circle */}
        <div
          className="h-12 w-12 shrink-0 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${service.color}18` }}
        >
          <div
            className="h-6 w-6 rounded-full"
            style={{ backgroundColor: service.color }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-zinc-900 dark:text-zinc-50 text-sm">
              {service.name}
            </span>
            {service.nameKo && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {service.nameKo}
              </span>
            )}
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATE_BADGE_CLASSES[currentState] || STATE_BADGE_CLASSES.offline}`}
            >
              {STATE_LABELS[currentState] || '확인 중'}
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
            {service.description}
          </p>
        </div>
      </div>

      {/* chips */}
      {(service.category || service.timeRestriction) && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {service.category && (
            <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 dark:bg-zinc-700 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              {service.category}
            </span>
          )}
          {service.timeRestriction && (
            <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 dark:bg-zinc-700 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              🕙 {service.timeRestriction}
            </span>
          )}
        </div>
      )}

      {/* status line */}
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
        {statusMessage(currentState, state.message)}
      </p>

      {/* footer */}
      <div className="flex items-center justify-between gap-2">
        {/* player count */}
        <div className="text-xs text-zinc-400 dark:text-zinc-500">
          {state.player_count !== null &&
            state.player_count !== undefined && (
              <span className="inline-flex items-center gap-1">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${state.player_count > 0 ? 'bg-green-500' : 'bg-zinc-400'}`}
                />
                {state.player_count === 0
                  ? '접속자 없음'
                  : `접속자 ${state.player_count}명`}
              </span>
            )}
        </div>

        {/* controls */}
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={!canStart}
            onClick={() => onAction(service.id, 'start')}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            시작
          </button>
          <button
            type="button"
            disabled={!canStop}
            onClick={() => onAction(service.id, 'stop')}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            종료
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(service.id, 'refresh')}
            className="rounded-lg border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            새로고침
          </button>
        </div>
      </div>
    </article>
  )
}

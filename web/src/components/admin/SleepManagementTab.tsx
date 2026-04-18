'use client'

import { useState, useEffect, useCallback } from 'react'

interface IdleServiceInfo {
  last_running_seen: string | null
  last_player_count: number | null
  idle_seconds: number | null
}

interface IdleStatus {
  watchdog_running: boolean
  services: Record<string, IdleServiceInfo>
  hibernate_policy_enabled: boolean
  hibernate_inhibit_active: boolean
}

interface HibernateCondition {
  pass: boolean
  [key: string]: unknown
}

interface HibernateDebug {
  conditions: Record<string, HibernateCondition>
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '-'
  if (seconds < 60) return `${seconds}초`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 ${seconds % 60}초`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}시간 ${m}분`
}

export function SleepManagementTab() {
  const [idle, setIdle] = useState<IdleStatus | null>(null)
  const [hibernate, setHibernate] = useState<HibernateDebug | null>(null)
  const [noSleepActive, setNoSleepActive] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const [idleRes, hibRes, nsRes] = await Promise.all([
        fetch('/api/admin/idle'),
        fetch('/api/admin/hibernate'),
        fetch('/api/admin/no-sleep'),
      ])
      if (idleRes.ok) setIdle(await idleRes.json())
      if (hibRes.ok) setHibernate(await hibRes.json())
      if (nsRes.ok) {
        const data = await nsRes.json()
        setNoSleepActive(data.active ?? null)
      }
      setError(null)
    } catch {
      setError('백엔드 연결 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const timer = setInterval(fetchAll, 10_000)
    return () => clearInterval(timer)
  }, [fetchAll])

  const toggleNoSleep = useCallback(async () => {
    setActionPending(true)
    try {
      const method = noSleepActive ? 'DELETE' : 'POST'
      const res = await fetch('/api/admin/no-sleep', { method })
      if (res.ok) {
        const data = await res.json()
        setNoSleepActive(data.active)
      }
    } catch {
      setError('요청 실패')
    } finally {
      setActionPending(false)
    }
  }, [noSleepActive])

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">불러오는 중...</p>
  }

  if (error && !idle) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
        {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* No-sleep toggle */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">절전 방지 플래그</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            활성화하면 백엔드 PC가 자동으로 절전 모드에 진입하지 않습니다.
          </p>
        </div>
        <button
          onClick={toggleNoSleep}
          disabled={actionPending}
          className={[
            'shrink-0 rounded-lg px-4 py-2 text-xs font-medium transition-colors',
            noSleepActive
              ? 'bg-amber-500 text-white hover:bg-amber-600'
              : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600',
            actionPending ? 'opacity-50 cursor-not-allowed' : '',
          ].join(' ')}
        >
          {noSleepActive ? '절전 방지 켜짐' : '절전 방지 꺼짐'}
        </button>
      </div>

      {/* Idle status */}
      {idle && (
        <section>
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">유휴 상태</h3>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
              <span>워치독: {idle.watchdog_running ?
                <span className="text-green-600 dark:text-green-400 font-medium">실행 중</span> :
                <span className="text-red-500 font-medium">중지됨</span>}
              </span>
              <span>·</span>
              <span>절전 정책: {idle.hibernate_policy_enabled ?
                <span className="font-medium">활성</span> :
                <span className="text-zinc-400">비활성</span>}
              </span>
              {idle.hibernate_inhibit_active && (
                <>
                  <span>·</span>
                  <span className="text-amber-500 font-medium">절전 억제 중</span>
                </>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/50">
                  <th className="px-4 py-2.5">서비스</th>
                  <th className="px-4 py-2.5">유휴 시간</th>
                  <th className="px-4 py-2.5">플레이어</th>
                  <th className="px-4 py-2.5">마지막 실행</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(idle.services).map(([id, info]) => (
                  <tr key={id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{id}</td>
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">{formatDuration(info.idle_seconds)}</td>
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">{info.last_player_count ?? '-'}</td>
                    <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-500 text-xs">{info.last_running_seen ?? '없음'}</td>
                  </tr>
                ))}
                {Object.keys(idle.services).length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-zinc-400">서비스 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Hibernate debug */}
      {hibernate && (
        <section>
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">절전 조건 디버그</h3>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/50">
                  <th className="px-4 py-2.5">조건</th>
                  <th className="px-4 py-2.5">상태</th>
                  <th className="px-4 py-2.5">상세</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(hibernate.conditions).map(([key, cond]) => (
                  <tr key={key} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-700 dark:text-zinc-300">{conditionLabel(key)}</td>
                    <td className="px-4 py-2.5">
                      <span className={[
                        'inline-block px-2 py-0.5 rounded-full text-xs font-bold',
                        cond.pass
                          ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400'
                          : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
                      ].join(' ')}>
                        {cond.pass ? '통과' : '차단'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500 dark:text-zinc-400">{conditionDetail(key, cond)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function conditionLabel(key: string): string {
  const labels: Record<string, string> = {
    policy_enabled: '정책 활성화',
    inhibit_timer: '억제 타이머',
    user_activity_guard: '사용자 활동',
    all_services_offline: '전체 서비스 오프라인',
    no_active_user_session: '활성 세션 없음',
    not_in_inhibit_schedule: '억제 스케줄 외',
    no_sleep_flag: '절전 방지 플래그',
  }
  return labels[key] || key
}

function conditionDetail(key: string, cond: HibernateCondition): string {
  if (key === 'inhibit_timer' && !cond.pass) {
    const remaining = cond.remaining_seconds as number
    return `${remaining}초 남음`
  }
  if (key === 'user_activity_guard' && cond.idle_seconds != null) {
    return `유휴 ${cond.idle_seconds}초 / 필요 ${cond.required_seconds}초`
  }
  if (key === 'not_in_inhibit_schedule' && cond.current_time) {
    return `현재 ${cond.current_time}`
  }
  if (key === 'all_services_offline' && cond.services) {
    const svcs = cond.services as Record<string, { state: string }>
    return Object.entries(svcs).map(([id, s]) => `${id}:${s.state}`).join(', ')
  }
  return ''
}

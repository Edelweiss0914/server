'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ServerCard } from './ServerCard'
import { TokenDialog } from './TokenDialog'

export interface ServiceConfig {
  id: string
  name: string
  nameKo: string
  description: string
  category: string
  timeRestriction?: string
  color: string
  bgColor: string
  icon: string
}

export interface ServiceState {
  state?: string
  message?: string
  player_count?: number | null
}

const SERVICES: ServiceConfig[] = [
  {
    id: 'minecraft-vanilla',
    name: 'Minecraft Vanilla',
    nameKo: '마인크래프트 바닐라',
    description: '백엔드 PC에서 온디맨드로 켜지는 게임 서버입니다.',
    category: 'Game Server',
    color: '#4b7f3f',
    bgColor: '#edf6ea',
    icon: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="12" y="16" width="76" height="24" rx="6" fill="#4b7f3f"/>
      <rect x="12" y="40" width="76" height="44" rx="8" fill="#6ea85f"/>
      <rect x="24" y="30" width="12" height="10" rx="2" fill="#2d4a22"/>
      <rect x="42" y="30" width="12" height="10" rx="2" fill="#2d4a22"/>
      <rect x="60" y="30" width="12" height="10" rx="2" fill="#2d4a22"/>
      <rect x="28" y="54" width="16" height="12" rx="3" fill="#2d4a22"/>
      <rect x="56" y="54" width="16" height="12" rx="3" fill="#2d4a22"/>
      <rect x="44" y="66" width="12" height="8" rx="2" fill="#2d4a22"/>
    </svg>`,
  },
  {
    id: 'minecraft-cobbleverse',
    name: 'Cobbleverse',
    nameKo: '코블버스',
    description: '백엔드 PC를 깨워 여는 Cobblemon 모드팩 서버입니다.',
    category: 'Game Server',
    timeRestriction: '10:00 ~ 01:00',
    color: '#c88b42',
    bgColor: '#fbf1e4',
    icon: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="12" y="14" width="76" height="22" rx="6" fill="#7d5330"/>
      <rect x="12" y="36" width="76" height="48" rx="8" fill="#c88b42"/>
      <circle cx="33" cy="28" r="6" fill="#ffe29a"/>
      <circle cx="50" cy="28" r="6" fill="#ffd15a"/>
      <circle cx="67" cy="28" r="6" fill="#ffe29a"/>
      <rect x="24" y="48" width="16" height="12" rx="3" fill="#5d381d"/>
      <rect x="42" y="62" width="16" height="12" rx="3" fill="#5d381d"/>
      <rect x="60" y="48" width="16" height="12" rx="3" fill="#5d381d"/>
    </svg>`,
  },
  {
    id: 'minecraft-hardcore',
    name: 'Hardcore Vanilla',
    nameKo: '하드코어 바닐라',
    description: '백엔드 PC에서 온디맨드로 켜지는 하드코어 게임 서버입니다.',
    category: 'Game Server',
    color: '#c0392b',
    bgColor: '#fce8e6',
    icon: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="50" cy="42" rx="28" ry="26" fill="#c0392b"/>
      <rect x="30" y="60" width="40" height="18" rx="4" fill="#c0392b"/>
      <rect x="35" y="62" width="8" height="10" rx="2" fill="white"/>
      <rect x="46" y="62" width="8" height="10" rx="2" fill="white"/>
      <rect x="57" y="62" width="8" height="10" rx="2" fill="white"/>
      <ellipse cx="38" cy="40" rx="8" ry="8" fill="white" opacity="0.9"/>
      <ellipse cx="62" cy="40" rx="8" ry="8" fill="white" opacity="0.9"/>
      <ellipse cx="50" cy="52" rx="4" ry="3" fill="white" opacity="0.6"/>
    </svg>`,
  },
]

const NORMAL_POLL_MS = 10_000
const ACTIVE_POLL_MS = 5_000
const TOKEN_STORAGE_KEY = 'cheeze-control-action-token'

function readToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function writeToken(token: string) {
  try {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token)
  } catch {
    /* noop */
  }
}

function clearToken() {
  try {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    /* noop */
  }
}

export function ServersGrid() {
  const [states, setStates] = useState<Record<string, ServiceState>>({})
  const [tokenDialog, setTokenDialog] = useState<{
    serviceId: string
    serviceName: string
    action: string
  } | null>(null)
  const pendingRef = useRef<Set<string>>(new Set())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- fetch all states (batch) ---
  const fetchAllStates = useCallback(async () => {
    try {
      const res = await fetch('/api/control/services')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { services?: Array<ServiceState & { id: string }> } = await res.json()
      const list = data.services ?? []

      setStates((prev) => {
        const next = { ...prev }
        SERVICES.forEach((service) => {
          if (pendingRef.current.has(service.id)) return
          const found = list.find((s) => s.id === service.id)
          next[service.id] = found ?? { state: 'offline' }
        })
        return next
      })
    } catch {
      setStates((prev) => {
        const next = { ...prev }
        SERVICES.forEach((service) => {
          if (pendingRef.current.has(service.id)) return
          next[service.id] = {
            state: 'error',
            message: '제어 API 상태를 읽지 못했습니다.',
          }
        })
        return next
      })
    }
  }, [])

  // --- polling ---
  const hasTransition = useCallback(() => {
    return SERVICES.some((s) => {
      const st = states[s.id]?.state
      return st === 'starting' || st === 'stopping' || st === 'waking'
    })
  }, [states])

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(
      async () => {
        await fetchAllStates()
        scheduleRefresh()
      },
      hasTransition() ? ACTIVE_POLL_MS : NORMAL_POLL_MS
    )
  }, [fetchAllStates, hasTransition])

  // initial load + polling
  useEffect(() => {
    fetchAllStates().then(() => scheduleRefresh())
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // re-schedule when transition state changes
  useEffect(() => {
    scheduleRefresh()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [scheduleRefresh])

  // visibility / focus handlers
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchAllStates().then(() => scheduleRefresh())
      }
    }
    const onFocus = () => {
      fetchAllStates().then(() => scheduleRefresh())
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [fetchAllStates, scheduleRefresh])

  // --- action handler ---
  const handleAction = useCallback(
    async (serviceId: string, action: string) => {
      if (action === 'refresh') {
        setStates((prev) => ({
          ...prev,
          [serviceId]: {
            ...(prev[serviceId] || {}),
            message: '상태를 다시 확인하는 중입니다...',
          },
        }))
        await fetchAllStates()
        scheduleRefresh()
        return
      }

      // resolve token
      let token = readToken()
      if (!token) {
        const service = SERVICES.find((s) => s.id === serviceId)
        setTokenDialog({
          serviceId,
          serviceName: service?.name || serviceId,
          action,
        })
        return
      }

      await executeAction(serviceId, action, token)
    },
    [fetchAllStates, scheduleRefresh]
  )

  const executeAction = useCallback(
    async (serviceId: string, action: string, token: string) => {
      pendingRef.current.add(serviceId)
      setStates((prev) => ({
        ...prev,
        [serviceId]: {
          ...(prev[serviceId] || {}),
          state: action === 'start' ? 'waking' : 'stopping',
          message:
            action === 'start'
              ? '백엔드와 서비스 상태를 확인하는 중입니다...'
              : '서비스를 안전하게 종료하는 중입니다...',
        },
      }))
      scheduleRefresh()

      try {
        const res = await fetch(`/api/control/services/${serviceId}/${action}`, {
          method: 'POST',
          headers: { 'X-Cheeze-Control-Token': token },
        })
        const raw = await res.text()
        let payload: Record<string, unknown> = {}
        try {
          payload = JSON.parse(raw)
        } catch {
          /* non-json */
        }

        if (!res.ok) {
          const msg = String(
            payload.message || payload.error || raw || `제어 요청 실패 (${res.status})`
          )
          if (msg.includes('valid control action token is required')) {
            clearToken()
          }
          throw new Error(msg)
        }

        const wakeResult = payload.wake_result as
          | { woke?: boolean }
          | undefined
        const wakeMsg =
          wakeResult?.woke
            ? '백엔드 PC를 깨워 서비스를 시작하는 중입니다.'
            : action === 'start'
              ? '서비스 시작 명령이 전달됐습니다.'
              : '서비스 종료 명령이 전달됐습니다.'

        setStates((prev) => ({
          ...prev,
          [serviceId]: {
            ...(prev[serviceId] || {}),
            state: action === 'start' ? 'starting' : 'stopping',
            message: wakeMsg,
          },
        }))
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : '서비스 제어 요청이 실패했습니다.'
        setStates((prev) => ({
          ...prev,
          [serviceId]: { state: 'error', message: msg },
        }))
      } finally {
        pendingRef.current.delete(serviceId)
        await fetchAllStates()
        scheduleRefresh()
      }
    },
    [fetchAllStates, scheduleRefresh]
  )

  // --- token dialog callbacks ---
  const handleTokenConfirm = useCallback(
    (token: string) => {
      if (!tokenDialog) return
      setTokenDialog(null)
      if (!token) {
        setStates((prev) => ({
          ...prev,
          [tokenDialog.serviceId]: {
            ...(prev[tokenDialog.serviceId] || {}),
            state: 'error',
            message: '제어 토큰이 필요합니다. 토큰 입력을 취소했거나 비어 있습니다.',
          },
        }))
        return
      }
      writeToken(token)
      executeAction(tokenDialog.serviceId, tokenDialog.action, token)
    },
    [tokenDialog, executeAction]
  )

  const handleTokenCancel = useCallback(() => {
    if (!tokenDialog) return
    setStates((prev) => ({
      ...prev,
      [tokenDialog.serviceId]: {
        ...(prev[tokenDialog.serviceId] || {}),
        state: 'error',
        message: '제어 토큰이 필요합니다. 토큰 입력을 취소했거나 비어 있습니다.',
      },
    }))
    setTokenDialog(null)
  }, [tokenDialog])

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map((service) => (
          <ServerCard
            key={service.id}
            service={service}
            state={states[service.id] || {}}
            onAction={handleAction}
          />
        ))}
      </div>

      {tokenDialog && (
        <TokenDialog
          serviceName={tokenDialog.serviceName}
          action={tokenDialog.action}
          onConfirm={handleTokenConfirm}
          onCancel={handleTokenCancel}
        />
      )}
    </>
  )
}

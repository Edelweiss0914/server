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
  },
  {
    id: 'minecraft-hardcore',
    name: 'Hardcore Vanilla',
    nameKo: '하드코어 바닐라',
    description: '백엔드 PC에서 온디맨드로 켜지는 하드코어 게임 서버입니다.',
    category: 'Game Server',
    color: '#c0392b',
    bgColor: '#fce8e6',
  },
]

const NORMAL_POLL_MS = 10_000
const ACTIVE_POLL_MS = 2_000
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

  // --- fetch all states ---
  const fetchAllStates = useCallback(async () => {
    const results = await Promise.allSettled(
      SERVICES.map(async (s) => {
        const res = await fetch(`/api/control/services/${s.id}`)
        if (!res.ok) throw new Error(`status ${res.status}`)
        return { id: s.id, payload: await res.json() }
      })
    )

    setStates((prev) => {
      const next = { ...prev }
      results.forEach((result, i) => {
        const service = SERVICES[i]
        if (pendingRef.current.has(service.id)) return
        if (result.status === 'fulfilled') {
          next[service.id] = result.value.payload
        } else {
          next[service.id] = {
            state: 'error',
            message: '제어 API 상태를 읽지 못했습니다.',
          }
        }
      })
      return next
    })
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

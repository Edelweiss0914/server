'use client'

import { useCallback, useEffect, useState } from 'react'

interface PterodactylNodeSummary {
  id: number
  uuid: string | null
  name: string
  fqdn: string | null
  scheme: string | null
  memory: number | null
  disk: number | null
  allocatedMemory: number | null
  allocatedDisk: number | null
  daemonListen: number | null
  daemonSftp: number | null
  public: boolean
  maintenanceMode: boolean
}

interface PterodactylServerSummary {
  id: number
  externalId: string | null
  uuid: string
  identifier: string
  name: string
  description: string | null
  status: string | null
  suspended: boolean
  nodeId: number | null
  nodeName: string | null
  memory: number | null
  disk: number | null
  cpu: number | null
  updatedAt: string | null
  createdAt: string | null
}

interface PterodactylOverview {
  panel: {
    panelUrl: string
    internalUrl: string
    reachable: boolean
    upstreamStatus: number | null
    checkedAt: string
    applicationApiConfigured: boolean
    message: string
  }
  servers: PterodactylServerSummary[]
  nodes: PterodactylNodeSummary[]
  applicationApiReachable: boolean
  applicationApiMessage: string
}

function statusTone(reachable: boolean) {
  return reachable
    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
    : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
}

function formatMb(value: number | null) {
  if (value === null) return '-'
  if (value >= 1024) return `${(value / 1024).toFixed(value % 1024 === 0 ? 0 : 1)} GB`
  return `${value} MB`
}

function serverStatusLabel(server: PterodactylServerSummary) {
  if (server.suspended) return '정지됨'
  if (server.status === 'installing') return '설치 중'
  if (server.status === 'restoring_backup') return '백업 복원 중'
  if (server.status === null) return '정상'
  return server.status
}

export function PterodactylTab() {
  const [overview, setOverview] = useState<PterodactylOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pterodactyl')
      const data = (await res.json()) as PterodactylOverview
      setOverview(data)
      setError(
        res.ok
          ? null
          : data.applicationApiMessage || data.panel.message || 'Pterodactyl 상태를 읽지 못했습니다.'
      )
    } catch {
      setError('Pterodactyl 상태를 읽는 중 네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      void fetchStatus()
    }, 0)
    const timer = setInterval(fetchStatus, 15_000)
    return () => {
      clearTimeout(initialTimer)
      clearInterval(timer)
    }
  }, [fetchStatus])

  if (loading && !overview) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">불러오는 중...</p>
  }

  const panel = overview?.panel
  const servers = overview?.servers ?? []
  const nodes = overview?.nodes ?? []

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Pterodactyl Panel
              </h2>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(panel?.reachable ?? false)}`}
              >
                {panel?.reachable ? '연결됨' : '확인 필요'}
              </span>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(overview?.applicationApiReachable ?? false)}`}
              >
                {overview?.applicationApiReachable ? 'Application API 연결됨' : 'Application API 미연결'}
              </span>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              기존 서버 제어 방식은 유지하고, 신규 게임 서버 운영만 Pterodactyl로 순차 이관합니다.
            </p>
          </div>
          <a
            href={panel?.panelUrl || 'https://panel.edelweiss0297.cloud'}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            패널 열기
          </a>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {!overview?.applicationApiReachable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">Application API 키 설정이 아직 완료되지 않았습니다.</p>
          <p className="mt-2">
            Panel의 <strong>Admin Panel → Application API</strong>에서 키를 발급한 뒤
            `PTERODACTYL_APPLICATION_API_KEY`에 넣으면 서버/노드 목록이 이 탭에 표시됩니다.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            현재 상태
          </h3>
          <dl className="space-y-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-zinc-500 dark:text-zinc-400">공개 URL</dt>
              <dd className="text-right text-zinc-900 dark:text-zinc-100">
                {panel?.panelUrl ?? '-'}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-zinc-500 dark:text-zinc-400">내부 확인 URL</dt>
              <dd className="text-right text-zinc-900 dark:text-zinc-100">
                {panel?.internalUrl ?? '-'}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-zinc-500 dark:text-zinc-400">HTTP 상태</dt>
              <dd className="text-right text-zinc-900 dark:text-zinc-100">
                {panel?.upstreamStatus ?? '연결 실패'}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-zinc-500 dark:text-zinc-400">Application API 키</dt>
              <dd className="text-right text-zinc-900 dark:text-zinc-100">
                {panel?.applicationApiConfigured ? '설정됨' : '미설정'}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-zinc-500 dark:text-zinc-400">마지막 확인</dt>
              <dd className="text-right text-zinc-900 dark:text-zinc-100">
                {panel?.checkedAt
                  ? new Date(panel.checkedAt).toLocaleString('ko-KR')
                  : '-'}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
            {overview?.applicationApiReachable ? overview.applicationApiMessage : panel?.message}
          </p>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            운영 원칙
          </h3>
          <ul className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
            <li>기존 Minecraft 서버는 현재 `portal-api / control-api` 흐름으로 계속 운영합니다.</li>
            <li>신규 서버만 Wings에 붙여서 실사용 검증을 먼저 진행합니다.</li>
            <li>안정화 전에는 `/servers`의 기존 시작·종료 UX를 제거하지 않습니다.</li>
            <li>Pterodactyl 데이터는 관리자 탭에서만 먼저 읽고, 안정화 후 공개 페이지에 병행 노출합니다.</li>
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            등록된 서버
          </h3>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {servers.length}개
          </span>
        </div>

        {servers.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            아직 표시할 Pterodactyl 서버가 없습니다.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {servers.map((server) => (
              <article
                key={server.id}
                className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-medium text-zinc-900 dark:text-zinc-50">
                      {server.name}
                    </h4>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {server.description || server.identifier}
                    </p>
                  </div>
                  <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {serverStatusLabel(server)}
                  </span>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <div>
                    <dt className="text-zinc-400 dark:text-zinc-500">Node</dt>
                    <dd>{server.nodeName || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-400 dark:text-zinc-500">UUID</dt>
                    <dd>{server.identifier || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-400 dark:text-zinc-500">Memory</dt>
                    <dd>{formatMb(server.memory)}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-400 dark:text-zinc-500">Disk</dt>
                    <dd>{formatMb(server.disk)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            등록된 노드
          </h3>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {nodes.length}개
          </span>
        </div>

        {nodes.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            아직 표시할 노드가 없습니다.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {nodes.map((node) => (
              <article
                key={node.id}
                className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-medium text-zinc-900 dark:text-zinc-50">
                      {node.name}
                    </h4>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {node.fqdn || node.uuid || `Node ${node.id}`}
                    </p>
                  </div>
                  <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {node.maintenanceMode ? '점검 모드' : '활성'}
                  </span>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <div>
                    <dt className="text-zinc-400 dark:text-zinc-500">Scheme</dt>
                    <dd>{node.scheme || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-400 dark:text-zinc-500">Daemon Port</dt>
                    <dd>{node.daemonListen ?? '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-400 dark:text-zinc-500">Memory</dt>
                    <dd>
                      {formatMb(node.allocatedMemory)} / {formatMb(node.memory)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-400 dark:text-zinc-500">Disk</dt>
                    <dd>
                      {formatMb(node.allocatedDisk)} / {formatMb(node.disk)}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

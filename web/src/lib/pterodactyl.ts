export interface PterodactylPanelStatus {
  panelUrl: string
  internalUrl: string
  reachable: boolean
  upstreamStatus: number | null
  checkedAt: string
  applicationApiConfigured: boolean
  message: string
}

export interface PterodactylServerSummary {
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

export interface PterodactylNodeSummary {
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

export interface PterodactylOverview {
  panel: PterodactylPanelStatus
  servers: PterodactylServerSummary[]
  nodes: PterodactylNodeSummary[]
  applicationApiReachable: boolean
  applicationApiMessage: string
}

interface JsonApiEntry<T> {
  attributes?: T
}

interface ApplicationApiList<T> {
  data?: Array<JsonApiEntry<T>>
}

interface RawServerAttributes {
  id?: number
  external_id?: string | null
  uuid?: string
  identifier?: string
  name?: string
  description?: string | null
  status?: string | null
  suspended?: boolean
  node?: number | null
  limits?: {
    memory?: number | null
    disk?: number | null
    cpu?: number | null
  }
  updated_at?: string | null
  created_at?: string | null
}

interface RawNodeAttributes {
  id?: number
  uuid?: string | null
  name?: string
  fqdn?: string | null
  scheme?: string | null
  memory?: number | null
  disk?: number | null
  allocated_resources?: {
    memory?: number | null
    disk?: number | null
  }
  daemon_listen?: number | null
  daemon_sftp?: number | null
  public?: boolean
  maintenance_mode?: boolean
}

const DEFAULT_PANEL_URL = 'https://panel.edelweiss0297.cloud'
const DEFAULT_PANEL_INTERNAL_URL = 'http://pterodactyl-panel'

function toNullableNumber(value: unknown) {
  return typeof value === 'number' ? value : null
}

function parseList<T>(payload: unknown): T[] {
  if (!payload || typeof payload !== 'object') return []

  const data = (payload as ApplicationApiList<T>).data
  if (!Array.isArray(data)) return []

  const items: T[] = []
  for (const entry of data) {
    if (entry?.attributes) {
      items.push(entry.attributes)
    }
  }

  return items
}

export function getPterodactylPanelUrl() {
  return process.env.PTERODACTYL_PANEL_URL || DEFAULT_PANEL_URL
}

export function getPterodactylInternalUrl() {
  return process.env.PTERODACTYL_PANEL_INTERNAL_URL || DEFAULT_PANEL_INTERNAL_URL
}

export function getPterodactylApplicationApiKey() {
  return process.env.PTERODACTYL_APPLICATION_API_KEY || ''
}

async function fetchApplicationApi(path: string) {
  const apiKey = getPterodactylApplicationApiKey()
  if (!apiKey) {
    throw new Error('missing_application_api_key')
  }

  const baseUrl = getPterodactylInternalUrl()
  return fetch(`${baseUrl}/api/application${path}`, {
    cache: 'no-store',
    headers: {
      Accept: 'Application/vnd.pterodactyl.v1+json',
      Authorization: `Bearer ${apiKey}`,
    },
  })
}

export async function fetchPterodactylPanelStatus(): Promise<PterodactylPanelStatus> {
  const panelUrl = getPterodactylPanelUrl()
  const internalUrl = getPterodactylInternalUrl()

  try {
    const upstream = await fetch(internalUrl, {
      cache: 'no-store',
      redirect: 'manual',
    })

    const reachable = upstream.status >= 200 && upstream.status < 400
    return {
      panelUrl,
      internalUrl,
      reachable,
      upstreamStatus: upstream.status,
      checkedAt: new Date().toISOString(),
      applicationApiConfigured: Boolean(getPterodactylApplicationApiKey()),
      message: reachable
        ? 'Pterodactyl Panel에 정상적으로 연결됩니다.'
        : `Pterodactyl Panel 응답이 비정상입니다. (${upstream.status})`,
    }
  } catch {
    return {
      panelUrl,
      internalUrl,
      reachable: false,
      upstreamStatus: null,
      checkedAt: new Date().toISOString(),
      applicationApiConfigured: Boolean(getPterodactylApplicationApiKey()),
      message: 'Next.js에서 Pterodactyl Panel 내부 엔드포인트에 연결하지 못했습니다.',
    }
  }
}

export async function fetchPterodactylOverview(): Promise<PterodactylOverview> {
  const panel = await fetchPterodactylPanelStatus()

  if (!panel.applicationApiConfigured) {
    return {
      panel,
      servers: [],
      nodes: [],
      applicationApiReachable: false,
      applicationApiMessage: 'PTERODACTYL_APPLICATION_API_KEY가 설정되지 않았습니다.',
    }
  }

  try {
    const [serversResponse, nodesResponse] = await Promise.all([
      fetchApplicationApi('/servers?per_page=100'),
      fetchApplicationApi('/nodes?per_page=100'),
    ])

    if (!serversResponse.ok || !nodesResponse.ok) {
      const status = !serversResponse.ok ? serversResponse.status : nodesResponse.status
      return {
        panel,
        servers: [],
        nodes: [],
        applicationApiReachable: false,
        applicationApiMessage: `Pterodactyl Application API 호출이 실패했습니다. (${status})`,
      }
    }

    const serversPayload = await serversResponse.json()
    const nodesPayload = await nodesResponse.json()

    const rawNodes = parseList<RawNodeAttributes>(nodesPayload)
    const nodes = rawNodes.map<PterodactylNodeSummary>((node) => ({
      id: node.id ?? 0,
      uuid: node.uuid ?? null,
      name: node.name || `Node ${node.id ?? '?'}`,
      fqdn: node.fqdn ?? null,
      scheme: node.scheme ?? null,
      memory: toNullableNumber(node.memory),
      disk: toNullableNumber(node.disk),
      allocatedMemory: toNullableNumber(node.allocated_resources?.memory),
      allocatedDisk: toNullableNumber(node.allocated_resources?.disk),
      daemonListen: toNullableNumber(node.daemon_listen),
      daemonSftp: toNullableNumber(node.daemon_sftp),
      public: Boolean(node.public),
      maintenanceMode: Boolean(node.maintenance_mode),
    }))

    const nodeNameById = new Map(nodes.map((node) => [node.id, node.name]))
    const rawServers = parseList<RawServerAttributes>(serversPayload)
    const servers = rawServers.map<PterodactylServerSummary>((server) => ({
      id: server.id ?? 0,
      externalId: server.external_id ?? null,
      uuid: server.uuid || '',
      identifier: server.identifier || '',
      name: server.name || `Server ${server.id ?? '?'}`,
      description: server.description ?? null,
      status: server.status ?? null,
      suspended: Boolean(server.suspended),
      nodeId: server.node ?? null,
      nodeName: server.node ? (nodeNameById.get(server.node) ?? null) : null,
      memory: toNullableNumber(server.limits?.memory),
      disk: toNullableNumber(server.limits?.disk),
      cpu: toNullableNumber(server.limits?.cpu),
      updatedAt: server.updated_at ?? null,
      createdAt: server.created_at ?? null,
    }))

    return {
      panel,
      servers,
      nodes,
      applicationApiReachable: true,
      applicationApiMessage: 'Application API에서 서버와 노드 정보를 정상적으로 읽었습니다.',
    }
  } catch (error) {
    const message =
      error instanceof Error && error.message === 'missing_application_api_key'
        ? 'PTERODACTYL_APPLICATION_API_KEY가 설정되지 않았습니다.'
        : 'Pterodactyl Application API에 연결하지 못했습니다.'

    return {
      panel,
      servers: [],
      nodes: [],
      applicationApiReachable: false,
      applicationApiMessage: message,
    }
  }
}

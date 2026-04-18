'use client'

import { useState, useCallback } from 'react'
import { ServiceStatusGrid, type AdminService } from '@/components/admin/ServiceStatusGrid'
import { ServiceControlGrid } from '@/components/admin/ServiceControlGrid'
import { AuditLogTab } from '@/components/admin/AuditLogTab'
import { ServerConsole } from '@/components/admin/ServerConsole'
import { SleepManagementTab } from '@/components/admin/SleepManagementTab'
import { MonitoringTab } from '@/components/admin/MonitoringTab'
import { PterodactylTab } from '@/components/admin/PterodactylTab'

type Tab = '서비스' | '감사 로그' | '절전 관리' | '모니터링' | 'Pterodactyl'
const TABS: Tab[] = ['서비스', '감사 로그', '절전 관리', '모니터링', 'Pterodactyl']

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('서비스')
  const [services, setServices] = useState<AdminService[]>([])
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleServicesUpdate = useCallback((updated: AdminService[]) => {
    setServices(updated)
    setLastRefresh(new Date())
    setError(null)
  }, [])

  return (
    <div className="flex flex-col gap-6">
      {/* Cloudflare Access info banner */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
        이 페이지는 Cloudflare Access 인증으로 보호됩니다.
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === '서비스' && (
        <div className="flex flex-col gap-6">
          {lastRefresh && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              마지막 갱신: {lastRefresh.toLocaleTimeString('ko-KR')}
            </p>
          )}

          <section>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
              서비스 상태
            </h2>
            <ServiceStatusGrid
              services={services}
              onServicesUpdate={handleServicesUpdate}
            />
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
              서버 콘솔
            </h2>
            <ServerConsole services={services.map((s) => ({ id: s.id, display_name: s.display_name }))} />
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
              서비스 제어
            </h2>
            <ServiceControlGrid
              services={services}
              onServicesUpdate={handleServicesUpdate}
            />
          </section>
        </div>
      )}

      {activeTab === '감사 로그' && <AuditLogTab />}

      {activeTab === '절전 관리' && <SleepManagementTab />}

      {activeTab === '모니터링' && <MonitoringTab />}

      {activeTab === 'Pterodactyl' && <PterodactylTab />}
    </div>
  )
}

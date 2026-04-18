import { SERVICES } from '@/lib/services'
import type { Service } from '@/lib/services'

function ServiceIcon({ service, size = 'lg' }: { service: Service; size?: 'md' | 'lg' }) {
  const dim = size === 'lg' ? 52 : 44
  const iconDim = size === 'lg' ? 32 : 26

  return (
    <div
      className="flex items-center justify-center rounded-xl shrink-0"
      style={{
        width: dim,
        height: dim,
        backgroundColor: service.bgColor || `${service.color}20`,
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{ width: iconDim, height: iconDim }}
        dangerouslySetInnerHTML={{ __html: service.icon }}
      />
    </div>
  )
}

function QuickCard({ service }: { service: Service }) {
  const isInternal = service.url.startsWith('/')
  const linkProps = isInternal
    ? {}
    : { target: '_blank' as const, rel: 'noopener noreferrer' }

  return (
    <a
      href={service.url}
      title={service.description}
      className="group relative flex flex-col items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 p-4 shadow-sm hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-600 transition-all"
      {...linkProps}
    >
      <ServiceIcon service={service} size="lg" />
      {service.onDemand && (
        <span className="absolute top-2 right-2 rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
          ON
        </span>
      )}
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 text-center">
        {service.nameKo || service.name}
      </span>
      <span className="text-xs text-zinc-400 dark:text-zinc-500 text-center">
        {service.name}
      </span>
    </a>
  )
}

export function QuickGrid() {
  const featured = SERVICES.filter((s) => s.featured)

  if (!featured.length) return null

  return (
    <section aria-label="빠른 접근">
      <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">
        서비스
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {featured.map((service) => (
          <QuickCard key={service.id} service={service} />
        ))}
      </div>
    </section>
  )
}

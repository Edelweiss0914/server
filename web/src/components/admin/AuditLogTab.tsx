'use client'

import { useState, useEffect } from 'react'
import { AuditLogSection } from './AuditLogSection'
import { IpLabelManager } from './IpLabelManager'

export function AuditLogTab() {
  const [ipLabels, setIpLabels] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/api/admin/ip-labels')
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setIpLabels(data))
      .catch(() => {})
  }, [])

  return (
    <div className="space-y-10">
      <AuditLogSection ipLabels={ipLabels} />
      <IpLabelManager labels={ipLabels} onLabelsChange={setIpLabels} />
    </div>
  )
}

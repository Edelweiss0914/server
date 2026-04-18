'use client'

import { useState } from 'react'

interface IpLabelManagerProps {
  labels: Record<string, string>
  onLabelsChange: (labels: Record<string, string>) => void
}

export function IpLabelManager({ labels, onLabelsChange }: IpLabelManagerProps) {
  const [ipInput, setIpInput] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const sortedEntries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b))

  async function handleDelete(ip: string) {
    if (!confirm(`"${ip}" 라벨을 삭제하시겠습니까?`)) return
    try {
      const res = await fetch(`/api/admin/ip-labels/${encodeURIComponent(ip)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`삭제 실패 (${res.status})`)
      const next = { ...labels }
      delete next[ip]
      onLabelsChange(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패')
    }
  }

  async function handleAddOrUpdate() {
    const ip = ipInput.trim()
    const name = nameInput.trim()
    if (!ip || !name) {
      setError('IP와 이름을 모두 입력하세요.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/ip-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, name }),
      })
      if (!res.ok) throw new Error(`저장 실패 (${res.status})`)
      onLabelsChange({ ...labels, [ip]: name })
      setIpInput('')
      setNameInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-base font-bold text-zinc-800 dark:text-zinc-100">IP 라벨</h2>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800 mb-4">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {['IP', '이름', ''].map((h, i) => (
                <th
                  key={i}
                  className="px-3.5 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedEntries.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3.5 py-4 text-center text-sm text-zinc-400">
                  등록된 라벨 없음
                </td>
              </tr>
            ) : (
              sortedEntries.map(([ip, name]) => (
                <tr
                  key={ip}
                  className="border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                >
                  <td className="px-3.5 py-2.5 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                    {ip}
                  </td>
                  <td className="px-3.5 py-2.5 text-sm text-zinc-700 dark:text-zinc-300">
                    {name}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <button
                      type="button"
                      onClick={() => handleDelete(ip)}
                      className="px-2.5 py-1 text-xs border border-zinc-300 dark:border-zinc-700 rounded hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-950 dark:hover:border-red-800 dark:hover:text-red-400 transition-colors"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={ipInput}
          onChange={(e) => setIpInput(e.target.value)}
          placeholder="IP 주소"
          className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 bg-transparent rounded-md text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="이름"
          onKeyDown={(e) => e.key === 'Enter' && handleAddOrUpdate()}
          className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 bg-transparent rounded-md text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={handleAddOrUpdate}
          disabled={saving}
          className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          {saving ? '저장 중...' : '추가 / 수정'}
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </section>
  )
}

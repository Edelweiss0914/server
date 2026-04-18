'use client'

import { useState } from 'react'

const SERVER_OPTIONS = [
  'Minecraft Vanilla',
  'Cobbleverse',
  'Hardcore Vanilla',
  '새 모드팩 서버',
  '기타',
]

const INITIAL_FORM = {
  requesterName: '',
  contact: '',
  desiredServer: SERVER_OPTIONS[0],
  expectedPlayers: '',
  preferredSchedule: '',
  notes: '',
}

export function RentalRequestPanel() {
  const [form, setForm] = useState(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
    setError(null)

    try {
      const res = await fetch('/api/server-rental', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      })

      const data = (await res.json()) as { message?: string; error?: string }
      if (!res.ok) {
        throw new Error(data.error || `요청 실패 (${res.status})`)
      }

      setMessage(data.message || '대여 신청이 접수되었습니다.')
      setForm(INITIAL_FORM)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : '대여 신청 중 오류가 발생했습니다.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  function updateField<K extends keyof typeof INITIAL_FORM>(
    key: K,
    value: (typeof INITIAL_FORM)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          서버 대여 신청
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          신규 서버는 현재 Pterodactyl 기반으로 순차 운영합니다. 원하는 서버 유형과 사용 계획을 남기면
          운영자가 확인 후 별도로 안내합니다.
        </p>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
          {message}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          신청자 이름
          <input
            required
            value={form.requesterName}
            onChange={(event) => updateField('requesterName', event.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            placeholder="닉네임 또는 이름"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          연락 수단
          <input
            required
            value={form.contact}
            onChange={(event) => updateField('contact', event.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            placeholder="Discord ID, 이메일 등"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          희망 서버 유형
          <select
            required
            value={form.desiredServer}
            onChange={(event) => updateField('desiredServer', event.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            {SERVER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          예상 동시 접속 인원
          <input
            value={form.expectedPlayers}
            onChange={(event) => updateField('expectedPlayers', event.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            placeholder="예: 5명 내외"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300 md:col-span-2">
          희망 일정
          <input
            value={form.preferredSchedule}
            onChange={(event) => updateField('preferredSchedule', event.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            placeholder="예: 주말 저녁 위주, 이번 달 안에 오픈 희망"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300 md:col-span-2">
          추가 메모
          <textarea
            rows={5}
            value={form.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            placeholder="원하는 모드팩, 월드 성격, 필요한 플러그인 등을 적어주세요."
          />
        </label>

        <div className="md:col-span-2 flex items-center justify-between gap-4 border-t border-zinc-100 pt-4 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <p>신청 내용은 운영 채널로 전달되며, 검토 후 개별 연락이 진행됩니다.</p>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? '전송 중...' : '대여 신청 보내기'}
          </button>
        </div>
      </form>
    </section>
  )
}

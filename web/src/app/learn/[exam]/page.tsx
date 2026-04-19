import Link from 'next/link'
import { getExamMeta, loadQuestions } from '@/data/questions/index'

interface PageProps {
  params: Promise<{ exam: string }>
}

export default async function ExamDetailPage({ params }: PageProps) {
  const { exam } = await params
  const meta = getExamMeta(exam)

  if (!meta) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Link
          href="/learn"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors mb-6"
        >
          &larr; 목록으로
        </Link>
        <p className="text-zinc-500 dark:text-zinc-400">시험을 찾을 수 없습니다.</p>
      </main>
    )
  }

  const allData = await loadQuestions(exam) as Array<{ category?: string; domain?: string }>
  const categories = Array.from(new Set(allData.map((q) => q.category ?? q.domain ?? '기타')))

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/learn"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors mb-6"
      >
        &larr; 목록으로
      </Link>

      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-1">
        {meta.nameKo}
      </h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">{meta.nameEn}</p>

      <p className="text-zinc-600 dark:text-zinc-300 mb-6">{meta.description}</p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">총 문제</p>
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{meta.totalQuestions}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">카테고리</p>
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{categories.length}</p>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="mb-8">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">카테고리</p>
          <ul className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <li
                key={c}
                className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href={`/learn/${exam}/quiz`}
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          전체 문제 풀기
        </Link>
        <Link
          href={`/learn/${exam}/quiz?mode=random&count=20`}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          랜덤 20문제
        </Link>
        <Link
          href={`/learn/${exam}/quiz?mode=wrong`}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          오답 복습
        </Link>
      </div>
    </main>
  )
}

import Link from 'next/link'
import { EXAMS } from '@/data/questions/index'
import { ExamList } from '@/components/learn/ExamList'

export default function LearnPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors mb-6"
      >
        &larr; 메인으로
      </Link>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-1">
        자격증 학습
      </h1>
      <p className="text-zinc-500 dark:text-zinc-400 mb-8">
        CBT 방식 문제풀이 · 해설 · 진도 추적
      </p>
      <ExamList exams={EXAMS} />
    </main>
  )
}

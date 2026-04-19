'use client'

import { useProgress } from '@/lib/quiz/useProgress'
import { ExamCard } from './ExamCard'
import type { ExamMeta } from '@/lib/quiz/types'

function ExamCardWithProgress({ exam }: { exam: ExamMeta }) {
  const { progress } = useProgress(exam.slug)
  return <ExamCard exam={exam} progress={progress} />
}

export function ExamList({ exams }: { exams: ExamMeta[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {exams.map((exam) => (
        <ExamCardWithProgress key={exam.id} exam={exam} />
      ))}
    </div>
  )
}

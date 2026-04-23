export interface Question {
  id: string
  examId: string
  category: string
  difficulty: 'easy' | 'medium' | 'hard'
  question: string
  options: string[]       // 4 options, index 0-3
  answer: number | number[]  // single index or array of indices for multi-answer
  explanation: string
}

export interface ExamMeta {
  id: string
  slug: string
  nameKo: string
  nameEn: string
  description: string
  totalQuestions: number
  color: string
  bgColor: string
  bgColorDark: string
  icon: string            // SVG string
  timeLimit?: number      // minutes
  passingScore?: number   // percentage (default: 72)
}

export interface ProgressRecord {
  correct: string[]
  wrong: string[]
  seen: string[]
  notes: Record<string, string>
}

export interface QuizSession {
  currentIndex: number
  answers: Record<string, number>
  completed: boolean
  startTime: string       // ISO date string
  timeLimit: number | null  // seconds, null = no limit
}

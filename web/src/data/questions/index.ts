import type { ExamMeta, Question } from '@/lib/quiz/types'

// Re-export types for consumers
export type { ExamMeta, Question }
// Alias for backwards compat with existing pages
export type QuizQuestion = Question

export const EXAMS: ExamMeta[] = [
  {
    id: 'aws-saa-c03',
    slug: 'aws-saa-c03',
    nameKo: 'AWS 솔루션스 아키텍트 어소시에이트',
    nameEn: 'AWS Solutions Architect Associate',
    description: 'AWS SAA-C03 자격증 대비 문제입니다. S3, EC2, VPC, IAM, RDS, Lambda, CloudFront 등 핵심 서비스를 다룹니다.',
    totalQuestions: 15,
    color: '#FF9900',
    bgColor: '#fff8f0',
    bgColorDark: '#2a1a00',
    icon: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="10" y="30" width="80" height="50" rx="8" fill="#FF9900"/>
      <path d="M25 55 L40 40 L55 52 L70 38 L80 48" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <rect x="20" y="20" width="20" height="14" rx="4" fill="#FF9900"/>
      <rect x="60" y="20" width="20" height="14" rx="4" fill="#FF9900"/>
      <circle cx="50" cy="22" r="8" fill="#232f3e"/>
      <path d="M46 22 L49 25 L54 19" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`,
  },
  {
    id: 'ccna-200-301',
    slug: 'ccna-200-301',
    nameKo: '시스코 CCNA',
    nameEn: 'Cisco CCNA',
    description: 'CCNA 200-301 자격증 대비 문제입니다. 라우팅, 스위칭, 보안, 무선, IP 서비스 등을 다룹니다.',
    totalQuestions: 10,
    color: '#1BA0D7',
    bgColor: '#f0f9ff',
    bgColorDark: '#001a2c',
    icon: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="50" cy="50" r="36" fill="#1BA0D7"/>
      <circle cx="50" cy="50" r="26" fill="white" opacity="0.15"/>
      <circle cx="50" cy="50" r="10" fill="white"/>
      <line x1="50" y1="14" x2="50" y2="30" stroke="white" stroke-width="4" stroke-linecap="round"/>
      <line x1="50" y1="70" x2="50" y2="86" stroke="white" stroke-width="4" stroke-linecap="round"/>
      <line x1="14" y1="50" x2="30" y2="50" stroke="white" stroke-width="4" stroke-linecap="round"/>
      <line x1="70" y1="50" x2="86" y2="50" stroke="white" stroke-width="4" stroke-linecap="round"/>
    </svg>`,
  },
]

export function getAllExams(): ExamMeta[] {
  return EXAMS
}

export function getExamMeta(slug: string): ExamMeta | undefined {
  return EXAMS.find((e) => e.slug === slug)
}

// Sync version for server components — loads via require
export function getExamQuestions(examSlug: string): Question[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const data = require(`@/data/questions/${examSlug}.json`) as Question[]
  return data
}

export async function loadQuestions(examSlug: string): Promise<Question[]> {
  const data = await import(`@/data/questions/${examSlug}.json`)
  return data.default as Question[]
}

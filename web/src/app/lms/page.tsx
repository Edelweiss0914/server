'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface AuthStatus {
  is_logged_in: boolean
  student_id: string | null
  last_login: string | null
}

interface CourseResponse {
  id: string
  name: string
  professor: string
  attendance_rate: number
  total_lectures: number
  attended_lectures: number
}

interface LectureResponse {
  id: string
  week: number
  session: number
  title: string
  attendance_status: 'attended' | 'partial' | 'absent' | 'not_started'
  deadline: string | null
  duration_seconds: number | null
}

interface AutomationStatus {
  state: 'idle' | 'running' | 'email_verification_required' | 'completed' | 'error'
  current_course: string | null
  current_lecture: string | null
  progress: number
  message: string
}

interface AutoMode {
  enabled: boolean
  schedule_cron: string
  target_courses: string[]
}

const ATTENDANCE_BADGE: Record<LectureResponse['attendance_status'], { label: string; cls: string }> = {
  attended: { label: '출석', cls: 'bg-green-700 text-green-100' },
  partial: { label: '반출석', cls: 'bg-yellow-700 text-yellow-100' },
  absent: { label: '결석', cls: 'bg-red-700 text-red-100' },
  not_started: { label: '미수강', cls: 'bg-gray-700 text-gray-300' },
}

function AttendanceBadge({ status }: { status: LectureResponse['attendance_status'] }) {
  const { label, cls } = ATTENDANCE_BADGE[status] ?? ATTENDANCE_BADGE.not_started
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

function AttendanceRateBadge({ rate }: { rate: number }) {
  const cls =
    rate >= 80 ? 'bg-green-700 text-green-100' :
    rate >= 60 ? 'bg-yellow-700 text-yellow-100' :
    'bg-red-700 text-red-100'
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {rate}%
    </span>
  )
}

export default function LmsPage() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)
  const [courses, setCourses] = useState<CourseResponse[]>([])
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null)
  const [lectures, setLectures] = useState<LectureResponse[]>([])
  const [automationStatus, setAutomationStatus] = useState<AutomationStatus>({
    state: 'idle',
    current_course: null,
    current_lecture: null,
    progress: 0,
    message: '',
  })
  const [loginForm, setLoginForm] = useState({ student_id: '', password: '' })
  const [verifyCode, setVerifyCode] = useState('')
  const [autoMode, setAutoMode] = useState<AutoMode>({
    enabled: false,
    schedule_cron: '',
    target_courses: [],
  })
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [loadingCourses, setLoadingCourses] = useState(false)
  const [loadingLectures, setLoadingLectures] = useState(false)
  const [loadingLogin, setLoadingLogin] = useState(false)
  const [loadingAutomation, setLoadingAutomation] = useState(false)
  const [loadingVerify, setLoadingVerify] = useState(false)
  const [loadingAutoMode, setLoadingAutoMode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAuthStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/lms/auth/status')
      const data = await res.json()
      setAuthStatus(data)
    } catch {
      setAuthStatus({ is_logged_in: false, student_id: null, last_login: null })
    } finally {
      setLoadingAuth(false)
    }
  }, [])

  const fetchCourses = useCallback(async () => {
    setLoadingCourses(true)
    try {
      const res = await fetch('/api/lms/courses')
      const data = await res.json()
      setCourses(data)
    } catch {
      setError('강좌 목록을 불러오지 못했습니다.')
    } finally {
      setLoadingCourses(false)
    }
  }, [])

  const fetchLectures = useCallback(async (courseId: string) => {
    setLoadingLectures(true)
    setLectures([])
    try {
      const res = await fetch(`/api/lms/courses/${courseId}/lectures`)
      const data = await res.json()
      setLectures(data)
    } catch {
      setError('강의 목록을 불러오지 못했습니다.')
    } finally {
      setLoadingLectures(false)
    }
  }, [])

  const fetchAutomationStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/lms/automation/status')
      const data: AutomationStatus = await res.json()
      setAutomationStatus(data)
      if (data.state === 'idle' || data.state === 'completed' || data.state === 'error') {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }
    } catch {
      // silent
    }
  }, [])

  const fetchAutoMode = useCallback(async () => {
    try {
      const res = await fetch('/api/lms/auto-mode')
      const data = await res.json()
      setAutoMode(data)
    } catch {
      // silent
    }
  }, [])

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(fetchAutomationStatus, 3000)
  }, [fetchAutomationStatus])

  useEffect(() => {
    fetchAuthStatus()
    fetchAutomationStatus()
  }, [fetchAuthStatus, fetchAutomationStatus])

  useEffect(() => {
    if (authStatus?.is_logged_in) {
      fetchCourses()
      fetchAutoMode()
    }
  }, [authStatus?.is_logged_in, fetchCourses, fetchAutoMode])

  useEffect(() => {
    if (automationStatus.state === 'running') {
      startPolling()
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [automationStatus.state, startPolling])

  const handleLogin = async () => {
    setLoadingLogin(true)
    setError(null)
    try {
      const res = await fetch('/api/lms/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '로그인 실패')
      } else {
        await fetchAuthStatus()
      }
    } catch {
      setError('로그인 중 오류가 발생했습니다.')
    } finally {
      setLoadingLogin(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/lms/auth/logout', { method: 'POST' })
      setAuthStatus({ is_logged_in: false, student_id: null, last_login: null })
      setCourses([])
      setSelectedCourse(null)
      setLectures([])
    } catch {
      setError('로그아웃 중 오류가 발생했습니다.')
    }
  }

  const handleStartAttendAll = async () => {
    setLoadingAutomation(true)
    setError(null)
    try {
      const res = await fetch('/api/lms/automation/attend-all', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '자동 출석 시작 실패')
      } else {
        setAutomationStatus((prev) => ({ ...prev, state: 'running' }))
        startPolling()
      }
    } catch {
      setError('자동 출석 시작 중 오류가 발생했습니다.')
    } finally {
      setLoadingAutomation(false)
    }
  }

  const handleStopAutomation = async () => {
    try {
      await fetch('/api/lms/automation/stop', { method: 'POST' })
      setAutomationStatus((prev) => ({ ...prev, state: 'idle', message: '중지됨' }))
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    } catch {
      setError('자동화 중지 중 오류가 발생했습니다.')
    }
  }

  const handleVerifyEmail = async () => {
    setLoadingVerify(true)
    setError(null)
    try {
      const res = await fetch('/api/lms/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '인증 실패')
      } else {
        setVerifyCode('')
        await fetchAutomationStatus()
      }
    } catch {
      setError('이메일 인증 중 오류가 발생했습니다.')
    } finally {
      setLoadingVerify(false)
    }
  }

  const handleUpdateAutoMode = async () => {
    setLoadingAutoMode(true)
    try {
      const res = await fetch('/api/lms/auto-mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(autoMode),
      })
      if (!res.ok) setError('자동 모드 설정 저장 실패')
    } catch {
      setError('자동 모드 설정 중 오류가 발생했습니다.')
    } finally {
      setLoadingAutoMode(false)
    }
  }

  const handleCourseClick = (courseId: string) => {
    if (selectedCourse === courseId) {
      setSelectedCourse(null)
      setLectures([])
    } else {
      setSelectedCourse(courseId)
      fetchLectures(courseId)
    }
  }

  const isRunning = automationStatus.state === 'running'

  if (loadingAuth) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-gray-400">로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">E-Class 자동화</h1>
        {authStatus?.is_logged_in && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">
              {authStatus.student_id}
              {authStatus.last_login && (
                <span className="ml-2 text-gray-500">
                  · 마지막 로그인: {new Date(authStatus.last_login).toLocaleString('ko-KR')}
                </span>
              )}
            </span>
            <button
              onClick={handleLogout}
              className="rounded-md bg-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-600 transition-colors"
            >
              로그아웃
            </button>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-sm text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {/* Login section */}
      {!authStatus?.is_logged_in && (
        <div className="rounded-xl bg-gray-800 border border-gray-700 p-6 max-w-sm">
          <h2 className="text-lg font-semibold text-white mb-4">E-Class 로그인</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">학번</label>
              <input
                type="text"
                value={loginForm.student_id}
                onChange={(e) => setLoginForm((f) => ({ ...f, student_id: e.target.value }))}
                placeholder="학번 입력"
                className="w-full rounded-md bg-gray-700 border border-gray-600 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">비밀번호</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="비밀번호 입력"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full rounded-md bg-gray-700 border border-gray-600 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={handleLogin}
              disabled={loadingLogin || !loginForm.student_id || !loginForm.password}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingLogin ? '로그인 중...' : '로그인'}
            </button>
          </div>
        </div>
      )}

      {/* Logged in content */}
      {authStatus?.is_logged_in && (
        <>
          {/* Automation control panel */}
          <div className="rounded-xl bg-gray-800 border border-gray-700 p-5">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">자동화 제어</h2>
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={handleStartAttendAll}
                disabled={isRunning || loadingAutomation}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loadingAutomation ? '시작 중...' : '전체 자동 출석'}
              </button>
              {isRunning && (
                <button
                  onClick={handleStopAutomation}
                  className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors"
                >
                  중지
                </button>
              )}
              <span
                className={`text-xs font-medium px-2 py-1 rounded ${
                  automationStatus.state === 'idle' ? 'bg-gray-700 text-gray-400' :
                  automationStatus.state === 'running' ? 'bg-blue-800 text-blue-200' :
                  automationStatus.state === 'completed' ? 'bg-green-800 text-green-200' :
                  automationStatus.state === 'error' ? 'bg-red-800 text-red-200' :
                  'bg-yellow-800 text-yellow-200'
                }`}
              >
                {automationStatus.state === 'idle' ? '대기' :
                 automationStatus.state === 'running' ? '실행 중' :
                 automationStatus.state === 'completed' ? '완료' :
                 automationStatus.state === 'error' ? '오류' : '인증 필요'}
              </span>
            </div>

            {isRunning && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>
                    {automationStatus.current_course && (
                      <span>강좌: {automationStatus.current_course}</span>
                    )}
                    {automationStatus.current_lecture && (
                      <span className="ml-2">· 강의: {automationStatus.current_lecture}</span>
                    )}
                  </span>
                  <span>{automationStatus.progress}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${automationStatus.progress}%` }}
                  />
                </div>
              </div>
            )}

            {automationStatus.message && (
              <p className="mt-2 text-xs text-gray-400">{automationStatus.message}</p>
            )}
          </div>

          {/* Course list */}
          <div>
            <h2 className="text-sm font-semibold text-gray-300 mb-3">
              수강 강좌
              {loadingCourses && <span className="ml-2 text-gray-500">불러오는 중...</span>}
            </h2>
            {!loadingCourses && courses.length === 0 && (
              <p className="text-sm text-gray-500">강좌가 없습니다.</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {courses.map((course) => (
                <div key={course.id}>
                  <button
                    onClick={() => handleCourseClick(course.id)}
                    className={`w-full text-left rounded-xl border p-4 transition-colors ${
                      selectedCourse === course.id
                        ? 'bg-gray-700 border-blue-600'
                        : 'bg-gray-800 border-gray-700 hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{course.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{course.professor}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {course.attended_lectures}/{course.total_lectures} 강의
                        </p>
                      </div>
                      <AttendanceRateBadge rate={course.attendance_rate} />
                    </div>
                  </button>

                  {/* Lecture table (expanded inline) */}
                  {selectedCourse === course.id && (
                    <div className="mt-2 rounded-xl bg-gray-800 border border-gray-700 overflow-hidden">
                      {loadingLectures ? (
                        <p className="text-sm text-gray-500 p-4">강의 목록 불러오는 중...</p>
                      ) : lectures.length === 0 ? (
                        <p className="text-sm text-gray-500 p-4">강의가 없습니다.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-700 text-xs text-gray-400">
                                <th className="px-3 py-2 text-left">주차</th>
                                <th className="px-3 py-2 text-left">차시</th>
                                <th className="px-3 py-2 text-left">제목</th>
                                <th className="px-3 py-2 text-left">상태</th>
                                <th className="px-3 py-2 text-left">마감</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lectures.map((lec) => (
                                <tr
                                  key={lec.id}
                                  className="border-b border-gray-700/50 last:border-0 hover:bg-gray-700/30"
                                >
                                  <td className="px-3 py-2 text-gray-300">{lec.week}주</td>
                                  <td className="px-3 py-2 text-gray-300">{lec.session}차시</td>
                                  <td className="px-3 py-2 text-gray-200 max-w-[200px] truncate">{lec.title}</td>
                                  <td className="px-3 py-2">
                                    <AttendanceBadge status={lec.attendance_status} />
                                  </td>
                                  <td className="px-3 py-2 text-gray-400 text-xs">
                                    {lec.deadline
                                      ? new Date(lec.deadline).toLocaleDateString('ko-KR')
                                      : '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Auto mode settings */}
          <div className="rounded-xl bg-gray-800 border border-gray-700 p-5">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">자동 모드 설정</h2>
            <div className="flex flex-col gap-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={autoMode.enabled}
                    onChange={(e) => setAutoMode((m) => ({ ...m, enabled: e.target.checked }))}
                  />
                  <div className="w-10 h-6 bg-gray-700 rounded-full peer peer-checked:bg-blue-600 transition-colors" />
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                </div>
                <span className="text-sm text-gray-300">자동 모드 활성화</span>
              </label>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  스케줄 (cron 표현식, 선택)
                </label>
                <input
                  type="text"
                  value={autoMode.schedule_cron}
                  onChange={(e) => setAutoMode((m) => ({ ...m, schedule_cron: e.target.value }))}
                  placeholder="예: 0 9 * * 1-5"
                  className="w-full max-w-xs rounded-md bg-gray-700 border border-gray-600 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                onClick={handleUpdateAutoMode}
                disabled={loadingAutoMode}
                className="self-start rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loadingAutoMode ? '저장 중...' : '설정 저장'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Email verification modal */}
      {automationStatus.state === 'email_verification_required' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="rounded-xl bg-gray-800 border border-gray-600 p-6 w-full max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-2">이메일 인증 필요</h3>
            <p className="text-sm text-gray-400 mb-4">
              이메일로 전송된 인증 코드를 입력하세요.
            </p>
            <input
              type="text"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              placeholder="인증 코드"
              className="w-full rounded-md bg-gray-700 border border-gray-600 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={handleVerifyEmail}
                disabled={loadingVerify || !verifyCode}
                className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loadingVerify ? '인증 중...' : '인증'}
              </button>
              <button
                onClick={() => setAutomationStatus((s) => ({ ...s, state: 'idle' }))}
                className="rounded-md bg-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-600 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

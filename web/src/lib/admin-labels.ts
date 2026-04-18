export function actionLabel(action: string): string {
  return (
    ({ start: '시작', stop: '종료', wake: '깨우기' } as Record<string, string>)[
      action?.toLowerCase()
    ] ||
    action ||
    '-'
  )
}

export function resultLabel(result: string): string {
  return (
    ({
      forwarded: '전달됨',
      rejected: '거부됨',
      failed: '실패',
      error: '오류',
    } as Record<string, string>)[result?.toLowerCase()] ||
    result ||
    '-'
  )
}

export function tokenLabel(entry: { token_label?: string; token_id?: string }): string {
  const raw = entry.token_label || entry.token_id || '-'
  const labels: Record<string, string> = {
    'Primary Admin Token': '기본 관리자 토큰',
    'admin-main': '기본 관리자 토큰',
    'Discord Bot Multi-Server Start Token': '디스코드 봇 시작 토큰',
    'discord-bot-start': '디스코드 봇 시작 토큰',
    'Discord Bot Multi-Server Stop Token': '디스코드 봇 종료 토큰',
    'discord-bot-stop': '디스코드 봇 종료 토큰',
    'Friend Game Start Token (24h)': '친구 게임 시작 토큰 (24시간)',
    'friend-game-start-24h': '친구 게임 시작 토큰 (24시간)',
    'legacy-admin-env-token': '레거시 관리자 토큰',
  }
  return labels[raw] || raw
}

export function stateLabel(state: string): string {
  return (
    ({
      offline: '꺼짐',
      waking: '깨우는 중',
      starting: '켜는 중',
      running: '가동 중',
      stopping: '종료 중',
      error: '오류',
    } as Record<string, string>)[state] || '확인 중'
  )
}

export function stateClass(state: string): string {
  return `is-${state || 'offline'}`
}

export function stateColorClass(state: string): string {
  switch (state) {
    case 'running':
      return 'bg-green-600 dark:bg-green-500'
    case 'starting':
    case 'waking':
      return 'bg-amber-500 dark:bg-amber-400 animate-pulse'
    case 'stopping':
      return 'bg-red-500 dark:bg-red-400 animate-pulse'
    case 'error':
      return 'bg-red-600 dark:bg-red-500'
    case 'offline':
    default:
      return 'bg-zinc-400 dark:bg-zinc-500'
  }
}

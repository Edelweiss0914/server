/**
 * =====================================================
 *  Edelweiss Home — 서비스 설정 파일
 * =====================================================
 *  새 서비스 추가 방법:
 *  1. 아래 SERVICES 배열에 새 항목 추가
 *  2. keywords 배열에 한글/영문 검색어 추가
 *  3. featured: true 로 빠른 접근 아이콘에 표시
 * =====================================================
 */

const SERVICES = [
  {
    id: 'nextcloud',
    name: 'Nextcloud',
    nameKo: '클라우드',
    description: '개인 클라우드 스토리지 · 파일 공유 · 캘린더 · 협업',
    url: 'https://edelweiss0297.cloud',
    // Nextcloud 서브도메인 이전 시: 'https://cloud.edelweiss0297.cloud'
    color: '#0082c9',
    bgColor: '#e6f3fa',
    bgColorDark: '#0a2a40',
    icon: `<svg viewBox="0 0 100 75" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="52" r="19" fill="#0082c9"/>
      <circle cx="50" cy="52" r="19" fill="#0082c9"/>
      <circle cx="80" cy="52" r="19" fill="#0082c9"/>
      <rect x="1" y="52" width="98" height="22" fill="#0082c9"/>
      <circle cx="35" cy="30" r="14" fill="#0082c9"/>
      <circle cx="65" cy="30" r="14" fill="#0082c9"/>
      <circle cx="50" cy="20" r="19" fill="#0082c9"/>
      <circle cx="28" cy="35" r="9" fill="white" opacity="0.25"/>
      <circle cx="18" cy="22" r="5" fill="white" opacity="0.2"/>
      <path d="M43 54 L50 42 L57 54 Z" fill="white"/>
      <rect x="46.5" y="42" width="7" height="14" rx="1" fill="white"/>
    </svg>`,
    keywords: [
      'nextcloud', 'cloud', '클라우드', '파일', 'file',
      '저장소', 'storage', 'drive', '드라이브',
      '동기화', 'sync', '사진', 'photo', '문서', 'document',
      '캘린더', 'calendar', '연락처', 'contact'
    ],
    category: '스토리지',
    categoryIcon: '☁️',
    featured: true,
    status: 'online', // 'online' | 'offline' | 'unknown'
  },

  // ─────────────────────────────────────────
  //  아래에 서비스를 추가하세요
  // ─────────────────────────────────────────

  // 미디어 서버 예시 (Jellyfin)
  // {
  //   id: 'jellyfin',
  //   name: 'Jellyfin',
  //   nameKo: '미디어',
  //   description: '개인 미디어 서버 · 영화 · TV · 음악',
  //   url: 'https://media.edelweiss0297.cloud',
  //   color: '#00a4dc',
  //   bgColor: '#e0f4fb',
  //   bgColorDark: '#082535',
  //   icon: '🎬',
  //   iconType: 'emoji',
  //   keywords: ['jellyfin', 'media', '미디어', '영화', 'movie', '음악', 'music', 'tv', '스트리밍', 'streaming'],
  //   category: '미디어',
  //   categoryIcon: '🎬',
  //   featured: true,
  // },

  // 코드 서버 예시 (Gitea / VS Code Server)
  // {
  //   id: 'gitea',
  //   name: 'Gitea',
  //   nameKo: '코드저장소',
  //   description: '개인 Git 저장소 · 코드 관리',
  //   url: 'https://git.edelweiss0297.cloud',
  //   color: '#609926',
  //   bgColor: '#edf5e5',
  //   bgColorDark: '#162409',
  //   icon: '🐙',
  //   iconType: 'emoji',
  //   keywords: ['gitea', 'git', '코드', 'code', '저장소', 'repository', '개발', 'dev'],
  //   category: '개발',
  //   categoryIcon: '💻',
  //   featured: true,
  // },

  // 대시보드 예시 (Portainer / Homepage)
  // {
  //   id: 'portainer',
  //   name: 'Portainer',
  //   nameKo: '대시보드',
  //   description: '서버 컨테이너 관리 대시보드',
  //   url: 'https://dash.edelweiss0297.cloud',
  //   color: '#13bef9',
  //   bgColor: '#e3f8fe',
  //   bgColorDark: '#041c26',
  //   icon: '🐳',
  //   iconType: 'emoji',
  //   keywords: ['portainer', 'docker', '도커', '컨테이너', 'container', '대시보드', 'dashboard', '서버', 'server'],
  //   category: '관리',
  //   categoryIcon: '⚙️',
  //   featured: false,
  // },
];

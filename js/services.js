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
    url: 'https://cloud.edelweiss0297.cloud',
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
  {
    id: 'paperless',
    name: 'Paperless ngx',
    nameKo: '페이퍼리스',
    description: '검색 가능한 문서 아카이브로, 스캔 파일, PDF, 영수증 및 각종 사무용 파일을 효율적으로 관리할 수 있습니다',
    url: 'https://paperless.edelweiss0297.cloud',
    color: '#175c4c',
    bgColor: '#e6f4ef',
    bgColorDark: '#0d241d',
    icon: `<svg viewBox="0 0 100 75" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="60" height="67" rx="12" fill="#175c4c"/>
      <rect x="24" y="7" width="60" height="67" rx="12" fill="#2f8c76"/>
      <rect x="45" y="16" width="54" height="56" rx="9" fill="white"/>
      <rect x="55" y="30" width="23" height="5" rx="2" fill="#2f8c76"/>
      <rect x="55" y="42" width="33" height="5" rx="2" fill="#2f8c76"/>
      <rect x="55" y="54" width="27" height="5" rx="2" fill="#2f8c76"/>
    </svg>`,
    keywords: [
      'paperless', 'paperless-ngx', 'document', 'documents', 'archive',
      'ocr', 'scan', 'scanner', 'pdf', 'receipt', 'invoice', 'tika',
      'gotenberg', 'office', 'docs'
    ],
    category: 'Documents',
    categoryIcon: 'DOC',
    featured: true,
    status: 'planned',
  },
  {
    id: 'archivebox',
    name: 'ArchiveBox',
    nameKo: '아카이브 박스',
    description: '웹 페이지, 기사, 동영상 및 기타 링크를 장기적으로 보관할 수 있는 개인용 웹 아카이브입니다.',
    url: 'https://archive.edelweiss0297.cloud',
    color: '#8b5a2b',
    bgColor: '#f6ecdf',
    bgColorDark: '#2a1c10',
    icon: `<svg viewBox="0 0 100 75" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="16" y="12" width="68" height="14" rx="6" fill="#8b5a2b"/>
      <rect x="18" y="24" width="64" height="40" rx="6" fill="#c48743"/>
      <rect x="39" y="16" width="22" height="8" rx="4" fill="#f6ecdf"/>
      <rect x="28" y="35" width="44" height="18" rx="4" fill="#fff7ed"/>
      <rect x="35" y="41" width="14" height="3" rx="1.5" fill="#c48743"/>
      <rect x="35" y="47" width="24" height="3" rx="1.5" fill="#c48743"/>
    </svg>`,
    keywords: [
      'archivebox', 'archive', 'web archive', 'bookmark', 'bookmarks',
      'save page', 'article', 'snapshot', 'url', 'web', 'capture',
      'youtube', 'video', 'link', 'read later'
    ],
    category: 'Archive',
    categoryIcon: 'ARC',
    featured: true,
    status: 'planned',
  },
];

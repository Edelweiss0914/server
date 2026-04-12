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
  {
    id: 'ondemand',
    name: 'On-Demand 서버',
    nameKo: '온디맨드 서비스',
    description: 'Minecraft Vanilla · Cobbleverse · Ollama AI — 필요할 때만 켜지는 온디맨드 서비스',
    url: 'servers.html',
    color: '#4f7fff',
    bgColor: '#ebf0ff',
    bgColorDark: '#0e1533',
    icon: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="14" y="28" width="72" height="44" rx="10" fill="#4f7fff"/>
      <rect x="22" y="36" width="56" height="28" rx="6" fill="#ebf0ff"/>
      <circle cx="34" cy="50" r="6" fill="#4f7fff"/>
      <rect x="46" y="44" width="24" height="4" rx="2" fill="#4f7fff"/>
      <rect x="46" y="52" width="16" height="4" rx="2" fill="#4f7fff" opacity="0.5"/>
    </svg>`,
    keywords: [
      'ondemand', '온디맨드', 'server', '서버', 'game', '게임',
      'minecraft', '마인크래프트', 'cobbleverse', '코블버스',
    ],
    category: 'Game Server',
    categoryIcon: 'GAME',
    featured: true,
    onDemand: true,
  },
  {
    id: 'minecraft-vanilla',
    name: 'Minecraft Vanilla',
    nameKo: '마인크래프트 바닐라',
    description: '온디맨드 게임 서버. 클릭하면 서버 시작·종료 패널로 이동합니다.',
    category: 'Game Server',
    categoryIcon: 'GAME',
    url: 'servers.html',
    onDemand: true,
    icon: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="12" y="16" width="76" height="24" rx="6" fill="#4b7f3f"/>
      <rect x="12" y="40" width="76" height="44" rx="8" fill="#6ea85f"/>
      <rect x="24" y="30" width="12" height="10" rx="2" fill="#2d4a22"/>
      <rect x="42" y="30" width="12" height="10" rx="2" fill="#2d4a22"/>
      <rect x="60" y="30" width="12" height="10" rx="2" fill="#2d4a22"/>
      <rect x="28" y="54" width="16" height="12" rx="3" fill="#2d4a22"/>
      <rect x="56" y="54" width="16" height="12" rx="3" fill="#2d4a22"/>
      <rect x="44" y="66" width="12" height="8" rx="2" fill="#2d4a22"/>
    </svg>`,
    color: '#4b7f3f',
    bgColor: '#edf6ea',
    bgColorDark: '#162410',
    keywords: [
      'minecraft', '마인크래프트', 'game', '게임', 'server', '서버',
      'vanilla', '바닐라', 'gaming', 'play', '플레이',
    ],
    featured: false,
    searchable: false,
  },
  {
    id: 'minecraft-cobbleverse',
    name: 'Cobbleverse',
    nameKo: '코블버스',
    description: 'Cobblemon 기반 온디맨드 모드팩 서버. 클릭하면 서버 시작·종료 패널로 이동합니다.',
    category: 'Game Server',
    categoryIcon: 'GAME',
    url: 'servers.html',
    onDemand: true,
    icon: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="12" y="14" width="76" height="22" rx="6" fill="#7d5330"/>
      <rect x="12" y="36" width="76" height="48" rx="8" fill="#c88b42"/>
      <circle cx="33" cy="28" r="6" fill="#ffe29a"/>
      <circle cx="50" cy="28" r="6" fill="#ffd15a"/>
      <circle cx="67" cy="28" r="6" fill="#ffe29a"/>
      <rect x="24" y="48" width="16" height="12" rx="3" fill="#5d381d"/>
      <rect x="42" y="62" width="16" height="12" rx="3" fill="#5d381d"/>
      <rect x="60" y="48" width="16" height="12" rx="3" fill="#5d381d"/>
    </svg>`,
    color: '#c88b42',
    bgColor: '#fbf1e4',
    bgColorDark: '#2e1f11',
    keywords: [
      'cobbleverse', '코블버스', 'cobblemon', '코블몬', 'pokemon', '포켓몬',
      'minecraft modpack', '마인크래프트 모드팩', 'modpack', '모드팩',
      'game', '게임', 'server', '서버', 'pixelmon-like',
    ],
    featured: false,
    searchable: false,
  },
  {
    id: 'ollama',
    name: 'Ollama AI',
    nameKo: '로컬 AI',
    description: '온디맨드 로컬 LLM 추론 서버. 필요할 때만 켜서 사용하는 AI 서비스입니다.',
    category: 'AI',
    categoryIcon: 'AI',
    url: 'servers.html',
    onDemand: true,
    icon: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="18" y="18" width="64" height="64" rx="16" fill="#e85d26"/>
      <rect x="30" y="30" width="16" height="16" rx="4" fill="white" opacity="0.9"/>
      <rect x="54" y="30" width="16" height="16" rx="4" fill="white" opacity="0.9"/>
      <rect x="30" y="54" width="16" height="16" rx="4" fill="white" opacity="0.9"/>
      <rect x="54" y="54" width="16" height="16" rx="4" fill="white" opacity="0.9"/>
      <rect x="44" y="38" width="12" height="24" rx="3" fill="white" opacity="0.5"/>
      <rect x="30" y="44" width="40" height="12" rx="3" fill="white" opacity="0.5"/>
    </svg>`,
    color: '#e85d26',
    bgColor: '#fef0e8',
    bgColorDark: '#2a1108',
    keywords: [
      'ollama', 'ai', 'llm', '인공지능', '로컬 ai', 'local ai',
      'chat', '챗봇', 'language model', '언어모델', 'gpt', 'qwen',
    ],
    featured: false,
    searchable: false,
  },
];

window.APP_CONFIG = {
  ai: {
    enabled: true,
    endpoint: '/ai',
    model: 'huihui_ai/qwen3-vl-abliterated:8b-instruct',
    timeoutMs: 90000,
  },
  control: {
    enabled: true,
    endpoint: '/api/control',
    refreshMs: 10000,
    activeRefreshMs: 2000,
    actionsRequireToken: true,
    actionTokenHeader: 'X-Cheeze-Control-Token',
    actionTokenStorageKey: 'cheeze-control-action-token',
    services: [
      {
        id: 'minecraft-vanilla',
        name: 'Minecraft Vanilla',
        nameKo: '마인크래프트 바닐라',
        description: '백엔드 PC에서 온디맨드로 켜지는 게임 서버입니다.',
        category: 'Game Server',
        categoryIcon: 'GAME',
        icon: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="12" y="16" width="76" height="24" rx="6" fill="#4b7f3f"/>
          <rect x="12" y="40" width="76" height="44" rx="8" fill="#6ea85f"/>
          <rect x="24" y="30" width="12" height="10" rx="2" fill="#2d4a22"/>
          <rect x="42" y="30" width="12" height="10" rx="2" fill="#2d4a22"/>
          <rect x="60" y="30" width="12" height="10" rx="2" fill="#2d4a22"/>
          <rect x="28" y="54" width="16" height="12" rx="3" fill="#2d4a22"/>
          <rect x="56" y="54" width="16" height="12" rx="3" fill="#2d4a22"/>
          <rect x="44" y="66" width="12" height="8" rx="2" fill="#2d4a22"/>
        </svg>`,
        color: '#4b7f3f',
        bgColor: '#edf6ea',
      },
      {
        id: 'minecraft-cobbleverse',
        name: 'Cobbleverse',
        nameKo: '코블버스',
        description: '백엔드 PC를 깨워 여는 Cobblemon 모드팩 서버입니다.',
        category: 'Game Server',
        categoryIcon: 'GAME',
        icon: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="12" y="14" width="76" height="22" rx="6" fill="#7d5330"/>
          <rect x="12" y="36" width="76" height="48" rx="8" fill="#c88b42"/>
          <circle cx="33" cy="28" r="6" fill="#ffe29a"/>
          <circle cx="50" cy="28" r="6" fill="#ffd15a"/>
          <circle cx="67" cy="28" r="6" fill="#ffe29a"/>
          <rect x="24" y="48" width="16" height="12" rx="3" fill="#5d381d"/>
          <rect x="42" y="62" width="16" height="12" rx="3" fill="#5d381d"/>
          <rect x="60" y="48" width="16" height="12" rx="3" fill="#5d381d"/>
        </svg>`,
        color: '#c88b42',
        bgColor: '#fbf1e4',
      },
      {
        id: 'ollama',
        name: 'Ollama AI',
        nameKo: '로컬 AI',
        description: '온디맨드 로컬 LLM 추론 서버. 필요할 때만 켜서 사용합니다.',
        category: 'AI',
        categoryIcon: 'AI',
        showSpeedIndicator: true,
        icon: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="18" y="18" width="64" height="64" rx="16" fill="#e85d26"/>
          <rect x="30" y="30" width="16" height="16" rx="4" fill="white" opacity="0.9"/>
          <rect x="54" y="30" width="16" height="16" rx="4" fill="white" opacity="0.9"/>
          <rect x="30" y="54" width="16" height="16" rx="4" fill="white" opacity="0.9"/>
          <rect x="54" y="54" width="16" height="16" rx="4" fill="white" opacity="0.9"/>
          <rect x="44" y="38" width="12" height="24" rx="3" fill="white" opacity="0.5"/>
          <rect x="30" y="44" width="40" height="12" rx="3" fill="white" opacity="0.5"/>
        </svg>`,
        color: '#e85d26',
        bgColor: '#fef0e8',
      }
    ],
  },
};

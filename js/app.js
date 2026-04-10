/**
 * =====================================================
 *  Edelweiss Home — 앱 로직
 * =====================================================
 */

// ─── 테마 관리 ───────────────────────────────────────

function initTheme() {
  const saved = localStorage.getItem('edelweiss-theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('edelweiss-theme', theme);
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.setAttribute('aria-label', theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
    btn.querySelector('.icon-sun').style.display  = theme === 'dark'  ? 'block' : 'none';
    btn.querySelector('.icon-moon').style.display = theme === 'light' ? 'block' : 'none';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ─── 서비스 아이콘 렌더링 ─────────────────────────────

function renderIcon(service, size = 'md') {
  const dim = size === 'lg' ? 52 : 44;
  const iconDim = size === 'lg' ? 32 : 26;
  const bg = `var(--service-bg, ${service.bgColor || service.color + '20'})`;

  if (service.iconType === 'emoji') {
    const fontSize = size === 'lg' ? '26px' : '22px';
    return `<div class="service-icon" style="width:${dim}px;height:${dim}px;background:${bg};font-size:${fontSize}">
      ${service.icon}
    </div>`;
  }

  // SVG
  return `<div class="service-icon" style="width:${dim}px;height:${dim}px;background:${bg}">
    <div style="width:${iconDim}px;height:${iconDim}px;display:flex;align-items:center;justify-content:center;">
      ${service.icon}
    </div>
  </div>`;
}

// ─── 검색 로직 ────────────────────────────────────────

function normalizeText(text) {
  return (text || '').toLowerCase().trim();
}

function scoreService(service, query) {
  const q = normalizeText(query);
  if (!q) return 0;

  const fields = [
    { text: normalizeText(service.name),        weight: 10 },
    { text: normalizeText(service.nameKo || ''), weight: 10 },
    { text: normalizeText(service.description),  weight: 3  },
    { text: normalizeText(service.category || ''), weight: 5 },
    ...service.keywords.map(k => ({ text: normalizeText(k), weight: 7 })),
  ];

  let score = 0;
  for (const { text, weight } of fields) {
    if (text === q)           score += weight * 3;  // 완전 일치
    else if (text.startsWith(q)) score += weight * 2;  // 시작 일치
    else if (text.includes(q))   score += weight;       // 부분 일치
  }
  return score;
}

function searchServices(query) {
  if (!query.trim()) return [];
  return SERVICES
    .map(s => ({ service: s, score: scoreService(s, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ service }) => service);
}

// ─── 카드 렌더링 ──────────────────────────────────────

function renderResultCard(service) {
  const urlDisplay = service.url.replace(/^https?:\/\//, '');
  const bgVar = `--service-bg: ${service.bgColor || service.color + '18'}`;

  return `
    <a href="${service.url}"
       class="result-card"
       target="_blank"
       rel="noopener noreferrer"
       style="${bgVar}; --service-color: ${service.color}">
      <div class="result-card-inner">
        ${renderIcon(service, 'md')}
        <div class="result-info">
          <div class="result-name">
            ${service.name}
            ${service.nameKo ? `<span class="result-name-ko">${service.nameKo}</span>` : ''}
            ${service.categoryIcon ? `<span class="result-category">${service.categoryIcon} ${service.category}</span>` : ''}
          </div>
          <div class="result-desc">${service.description}</div>
          <div class="result-url">${urlDisplay}</div>
        </div>
        <div class="result-arrow" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </div>
      </div>
    </a>`;
}

function renderQuickCard(service) {
  const bgVar = `--service-bg: ${service.bgColor || service.color + '18'}`;
  return `
    <a href="${service.url}"
       class="quick-card"
       target="_blank"
       rel="noopener noreferrer"
       title="${service.description}"
       style="${bgVar}; --service-color: ${service.color}">
      ${renderIcon(service, 'lg')}
      <span class="quick-name">${service.nameKo || service.name}</span>
      <span class="quick-sub">${service.name}</span>
    </a>`;
}

function renderNoResults(query) {
  return `
    <div class="no-results">
      <div class="no-results-icon">🔍</div>
      <p class="no-results-text">"<strong>${escapeHtml(query)}</strong>" 검색 결과 없음</p>
      <p class="no-results-hint">services.js 에서 새 서비스를 추가할 수 있습니다</p>
    </div>`;
}

function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, m => map[m]);
}

// ─── 검색 상태 관리 ───────────────────────────────────

const $ = id => document.getElementById(id);

const els = {
  input:         () => $('searchInput'),
  clearBtn:      () => $('clearBtn'),
  resultsSection:() => $('resultsSection'),
  resultsGrid:   () => $('resultsGrid'),
  resultsCount:  () => $('resultsCount'),
  quickAccess:   () => $('quickAccess'),
  quickGrid:     () => $('quickGrid'),
};

let currentResults = [];

function showResults(query) {
  const results = searchServices(query);
  currentResults = results;

  const hasQuery = query.trim().length > 0;

  // 빠른 접근 / 결과 섹션 토글
  els.quickAccess().style.display    = hasQuery ? 'none' : 'block';
  els.resultsSection().style.display = hasQuery ? 'block' : 'none';
  els.clearBtn().style.opacity       = hasQuery ? '1' : '0';
  els.clearBtn().style.pointerEvents = hasQuery ? 'auto' : 'none';

  if (!hasQuery) return;

  if (results.length === 0) {
    els.resultsCount().textContent = '';
    els.resultsGrid().innerHTML = renderNoResults(query);
    return;
  }

  els.resultsCount().textContent = `${results.length}개의 서비스`;
  els.resultsGrid().innerHTML = results.map(renderResultCard).join('');
}

// ─── 초기화 ───────────────────────────────────────────

function initQuickAccess() {
  const featured = SERVICES.filter(s => s.featured !== false);
  if (featured.length === 0) {
    els.quickAccess().style.display = 'none';
    return;
  }
  els.quickGrid().innerHTML = featured.map(renderQuickCard).join('');
}

function initEventListeners() {
  // 검색 입력
  els.input().addEventListener('input', e => showResults(e.target.value));

  // 키보드
  els.input().addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (currentResults.length > 0) {
        window.open(currentResults[0].url, '_blank', 'noopener,noreferrer');
      }
    }
    if (e.key === 'Escape') {
      els.input().value = '';
      showResults('');
      els.input().blur();
    }
  });

  // 지우기 버튼
  els.clearBtn().addEventListener('click', () => {
    els.input().value = '';
    showResults('');
    els.input().focus();
  });

  // 테마 토글
  $('themeToggle').addEventListener('click', toggleTheme);

  // 전역 단축키: / 로 검색창 포커스
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== els.input()) {
      e.preventDefault();
      els.input().focus();
      els.input().select();
    }
  });

  // 시스템 다크모드 변경 감지
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('edelweiss-theme')) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });
}

// ─── 진입점 ───────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initQuickAccess();
  initEventListeners();

  // 자동 포커스 (모바일 제외)
  if (window.innerWidth > 768) {
    els.input().focus();
  }
});

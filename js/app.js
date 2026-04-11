/**
 * CHEEZE home page logic.
 * - Service search remains the default behavior.
 * - AI is invoked only when the user clicks the AI suggestion card.
 */

const AI_CONFIG = (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.ai) || {
  enabled: true,
  endpoint: '/ai',
  model: 'huihui_ai/qwen3-vl-abliterated:8b-instruct',
  timeoutMs: 90000,
};

function initTheme() {
  const savedTheme = localStorage.getItem('edelweiss-theme');
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(savedTheme || systemTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('edelweiss-theme', theme);

  const button = document.getElementById('themeToggle');
  if (!button) return;

  button.setAttribute('aria-label', theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');

  const sun = button.querySelector('.icon-sun');
  const moon = button.querySelector('.icon-moon');

  if (sun) sun.style.display = theme === 'dark' ? 'block' : 'none';
  if (moon) moon.style.display = theme === 'light' ? 'block' : 'none';
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

function renderIcon(service, size = 'md') {
  const dim = size === 'lg' ? 52 : 44;
  const iconDim = size === 'lg' ? 32 : 26;
  const bg = `var(--service-bg, ${service.bgColor || `${service.color}20`})`;

  if (service.iconType === 'emoji') {
    const fontSize = size === 'lg' ? '26px' : '22px';
    return `<div class="service-icon" style="width:${dim}px;height:${dim}px;background:${bg};font-size:${fontSize}">${service.icon}</div>`;
  }

  return `
    <div class="service-icon" style="width:${dim}px;height:${dim}px;background:${bg}">
      <div style="width:${iconDim}px;height:${iconDim}px;display:flex;align-items:center;justify-content:center;">
        ${service.icon}
      </div>
    </div>
  `;
}

function normalizeText(text) {
  return (text || '').toLowerCase().trim();
}

function scoreService(service, query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;

  const fields = [
    { text: normalizeText(service.name), weight: 10 },
    { text: normalizeText(service.nameKo || ''), weight: 10 },
    { text: normalizeText(service.description), weight: 3 },
    { text: normalizeText(service.category || ''), weight: 5 },
    ...service.keywords.map((keyword) => ({ text: normalizeText(keyword), weight: 7 })),
  ];

  let score = 0;

  for (const { text, weight } of fields) {
    if (text === normalizedQuery) score += weight * 3;
    else if (text.startsWith(normalizedQuery)) score += weight * 2;
    else if (text.includes(normalizedQuery)) score += weight;
  }

  return score;
}

function searchServices(query) {
  if (!query.trim()) return [];

  return SERVICES
    .map((service) => ({ service, score: scoreService(service, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ service }) => service);
}

function escapeHtml(str) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };

  return String(str).replace(/[&<>"']/g, (char) => map[char]);
}

function renderResultCard(service) {
  const urlDisplay = service.url.replace(/^https?:\/\//, '');
  const bgVar = `--service-bg: ${service.bgColor || `${service.color}18`}`;

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
          <div class="result-desc"><span class="result-desc-text">${service.description}</span></div>
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
    </a>
  `;
}

function renderQuickCard(service) {
  const bgVar = `--service-bg: ${service.bgColor || `${service.color}18`}`;

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
    </a>
  `;
}

function renderNoResults(query) {
  return `
    <div class="no-results">
      <div class="no-results-icon">?</div>
      <p class="no-results-text">"${escapeHtml(query)}"에 맞는 서비스가 없습니다.</p>
      <p class="no-results-hint">위 AI 카드로 바로 질문할 수 있습니다.</p>
    </div>
  `;
}

function renderAiAnswer(text) {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function syncResultDescOverflow(root = document) {
  root.querySelectorAll('.result-desc').forEach((desc) => {
    const text = desc.querySelector('.result-desc-text');
    if (!text) return;

    desc.classList.remove('is-overflowing');
    desc.style.removeProperty('--marquee-distance');

    const overflow = text.scrollWidth - desc.clientWidth;
    if (overflow > 4) {
      desc.classList.add('is-overflowing');
      desc.style.setProperty('--marquee-distance', `${-overflow}px`);
    }
  });
}

const $ = (id) => document.getElementById(id);

const els = {
  input: () => $('searchInput'),
  clearBtn: () => $('clearBtn'),
  resultsSection: () => $('resultsSection'),
  resultsGrid: () => $('resultsGrid'),
  resultsCount: () => $('resultsCount'),
  quickAccess: () => $('quickAccess'),
  quickGrid: () => $('quickGrid'),
  aiSection: () => $('aiSection'),
  aiPromptCard: () => $('aiPromptCard'),
  aiPromptTitle: () => $('aiPromptTitle'),
  aiPromptMeta: () => $('aiPromptMeta'),
  aiResponseCard: () => $('aiResponseCard'),
  aiResponseStatus: () => $('aiResponseStatus'),
  aiResponseBody: () => $('aiResponseBody'),
  followupForm: () => $('aiFollowupForm'),
  followupInput: () => $('aiFollowupInput'),
};

let currentResults = [];
let currentQuery = '';
let aiAbortController = null;

function ensureAiSection() {
  if ($('aiSection')) return;

  const resultsSection = els.resultsSection();
  if (!resultsSection || !resultsSection.parentNode) return;

  const section = document.createElement('section');
  section.id = 'aiSection';
  section.className = 'ai-section';
  section.style.display = 'none';
  section.setAttribute('aria-live', 'polite');
  section.innerHTML = `
    <button type="button" class="ai-prompt-card" id="aiPromptCard">
      <div class="ai-prompt-label">CHEEZE AI</div>
      <div class="ai-prompt-title" id="aiPromptTitle"></div>
      <div class="ai-prompt-meta" id="aiPromptMeta">클릭하면 AI가 바로 답변합니다.</div>
    </button>
    <div class="ai-response-card" id="aiResponseCard" hidden>
      <div class="ai-response-status" id="aiResponseStatus"></div>
      <div class="ai-response-body" id="aiResponseBody"></div>
      <form class="ai-followup-form" id="aiFollowupForm" autocomplete="off">
        <label class="ai-followup-label" for="aiFollowupInput">다음 질문</label>
        <div class="ai-followup-bar">
          <input
            type="search"
            id="aiFollowupInput"
            class="ai-followup-input"
            placeholder="답변을 읽은 뒤 바로 이어서 질문하세요"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
          >
          <button type="submit" class="ai-followup-submit">질문</button>
        </div>
      </form>
    </div>
  `;

  resultsSection.parentNode.insertBefore(section, resultsSection);
}

function resetAiResponse() {
  const responseCard = els.aiResponseCard();
  const status = els.aiResponseStatus();
  const body = els.aiResponseBody();
  const followupInput = els.followupInput();

  if (responseCard) responseCard.hidden = true;
  if (status) status.textContent = '';
  if (body) body.innerHTML = '';
  if (followupInput) followupInput.value = '';
}

function hideEmptyResultsAfterAiRequest() {
  if (currentResults.length > 0) return;

  const resultsSection = els.resultsSection();
  const resultsCount = els.resultsCount();
  const resultsGrid = els.resultsGrid();

  if (resultsCount) resultsCount.textContent = '';
  if (resultsGrid) resultsGrid.innerHTML = '';
  if (resultsSection) resultsSection.style.display = 'none';
}

function syncQueryInputs(query, source = 'main') {
  const mainInput = els.input();
  const followupInput = els.followupInput();

  if (source !== 'main' && mainInput && mainInput.value !== query) {
    mainInput.value = query;
  }

  if (source !== 'followup' && followupInput && followupInput.value !== query) {
    followupInput.value = query;
  }
}

function updateAiPrompt(query) {
  const aiSection = els.aiSection();
  const promptTitle = els.aiPromptTitle();
  const promptMeta = els.aiPromptMeta();

  if (!aiSection || !promptTitle || !promptMeta) return;

  const hasQuery = query.trim().length > 0 && AI_CONFIG.enabled;

  aiSection.style.display = hasQuery ? 'block' : 'none';
  if (!hasQuery) {
    resetAiResponse();
    return;
  }

  promptTitle.textContent = `"${query}"을 질문하시겠습니까?`;
  promptMeta.textContent = currentResults.length > 0
    ? '서비스 카드는 유지되고, 이 카드를 누르면 AI 답변을 생성합니다.'
    : '일치하는 서비스가 없습니다. 이 카드를 눌러 AI에게 바로 질문하세요.';
}

async function requestAiAnswer(query) {
  if (!AI_CONFIG.enabled || !query.trim()) return;

  if (aiAbortController) {
    aiAbortController.abort();
  }

  aiAbortController = new AbortController();

  const responseCard = els.aiResponseCard();
  const status = els.aiResponseStatus();
  const body = els.aiResponseBody();
  const endpoint = `${AI_CONFIG.endpoint.replace(/\/$/, '')}/api/generate`;

  if (responseCard) responseCard.hidden = false;
  if (status) status.textContent = 'AI가 답변을 생성하는 중입니다...';
  if (body) body.innerHTML = '';
  syncQueryInputs(query);
  hideEmptyResultsAfterAiRequest();

  const timeoutId = window.setTimeout(() => aiAbortController.abort(), AI_CONFIG.timeoutMs || 90000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_CONFIG.model,
        prompt: query,
        stream: false,
      }),
      signal: aiAbortController.signal,
    });

    if (!response.ok) {
      throw new Error(`AI request failed with ${response.status}`);
    }

    const payload = await response.json();
    const text = payload.response || '응답이 비어 있습니다.';

    if (status) status.textContent = 'CHEEZE AI 응답';
    if (body) body.innerHTML = renderAiAnswer(text);
    const followupInput = els.followupInput();
    if (followupInput) {
      window.requestAnimationFrame(() => followupInput.focus());
    }
  } catch (error) {
    const message = error.name === 'AbortError'
      ? '응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'
      : 'AI 호출에 실패했습니다. 게이트웨이의 /ai 프록시와 Ollama 상태를 확인하세요.';

    if (status) status.textContent = 'AI 요청 실패';
    if (body) body.textContent = message;
  } finally {
    window.clearTimeout(timeoutId);
    aiAbortController = null;
  }
}

function showResults(query) {
  currentQuery = query;
  currentResults = searchServices(query);
  syncQueryInputs(query);

  const hasQuery = query.trim().length > 0;
  const quickAccess = els.quickAccess();
  const resultsSection = els.resultsSection();
  const clearBtn = els.clearBtn();
  const resultsCount = els.resultsCount();
  const resultsGrid = els.resultsGrid();

  if (quickAccess) quickAccess.style.display = hasQuery ? 'none' : 'block';
  if (resultsSection) resultsSection.style.display = hasQuery ? 'block' : 'none';
  if (clearBtn) {
    clearBtn.style.opacity = hasQuery ? '1' : '0';
    clearBtn.style.pointerEvents = hasQuery ? 'auto' : 'none';
  }

  updateAiPrompt(query);

  if (!hasQuery) {
    if (resultsCount) resultsCount.textContent = '';
    if (resultsGrid) resultsGrid.innerHTML = '';
    return;
  }

  if (!currentResults.length) {
    if (resultsCount) resultsCount.textContent = '';
    if (resultsGrid) resultsGrid.innerHTML = renderNoResults(query);
    return;
  }

  if (resultsCount) resultsCount.textContent = `${currentResults.length}개의 서비스`;
  if (resultsGrid) resultsGrid.innerHTML = currentResults.map(renderResultCard).join('');

  requestAnimationFrame(syncResultDescOverflow);
}

function initQuickAccess() {
  const featured = SERVICES.filter((service) => service.featured !== false);
  const quickAccess = els.quickAccess();
  const quickGrid = els.quickGrid();

  if (!featured.length) {
    if (quickAccess) quickAccess.style.display = 'none';
    return;
  }

  if (quickGrid) quickGrid.innerHTML = featured.map(renderQuickCard).join('');
}

function initEventListeners() {
  const input = els.input();
  const resultsGrid = els.resultsGrid();
  const clearBtn = els.clearBtn();
  const themeToggle = $('themeToggle');
  const aiPromptCard = els.aiPromptCard();
  const followupForm = els.followupForm();
  const followupInput = els.followupInput();

  if (input) {
    input.addEventListener('input', (event) => {
      resetAiResponse();
      showResults(event.target.value);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          requestAiAnswer(input.value);
          return;
        }

        if (currentResults.length > 0) {
          window.open(currentResults[0].url, '_blank', 'noopener,noreferrer');
        }
      }

      if (event.key === 'Escape') {
        input.value = '';
        resetAiResponse();
        showResults('');
        input.blur();
      }
    });
  }

  if (resultsGrid) {
    resultsGrid.addEventListener('mouseover', (event) => {
      const card = event.target.closest('.result-card');
      if (card) syncResultDescOverflow(card);
    });
  }

  if (clearBtn && input) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      resetAiResponse();
      showResults('');
      input.focus();
    });
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  if (aiPromptCard) {
    aiPromptCard.addEventListener('click', () => requestAiAnswer(currentQuery));
  }

  if (followupInput) {
    followupInput.addEventListener('input', (event) => {
      showResults(event.target.value);
    });
  }

  if (followupForm && followupInput) {
    followupForm.addEventListener('submit', (event) => {
      event.preventDefault();

      const query = followupInput.value.trim();
      if (!query) return;

      showResults(query);
      requestAiAnswer(query);
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && document.activeElement !== input && input) {
      event.preventDefault();
      input.focus();
      input.select();
    }
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    if (!localStorage.getItem('edelweiss-theme')) {
      applyTheme(event.matches ? 'dark' : 'light');
    }
  });

  window.addEventListener('resize', () => syncResultDescOverflow());
  window.addEventListener('load', () => syncResultDescOverflow());

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => syncResultDescOverflow());
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  ensureAiSection();
  initQuickAccess();
  initEventListeners();

  if (window.innerWidth > 768 && els.input()) {
    els.input().focus();
  }
});

/**
 * CHEEZE home page logic.
 * - Service search
 * - AI prompt / response flow
 * - On-demand service controls via the public portal facade
 */

const AI_CONFIG = (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.ai) || {
  enabled: true,
  endpoint: '/ai',
  model: 'huihui_ai/qwen3-vl-abliterated:8b-instruct',
  timeoutMs: 90000,
};

const CONTROL_CONFIG = (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.control) || {
  enabled: false,
  endpoint: '/api/control',
  refreshMs: 10000,
  services: [],
};

const $ = (id) => document.getElementById(id);

const els = {
  input: () => $('searchInput'),
  clearBtn: () => $('clearBtn'),
  quickAccess: () => $('quickAccess'),
  quickGrid: () => $('quickGrid'),
  resultsSection: () => $('resultsSection'),
  resultsGrid: () => $('resultsGrid'),
  resultsCount: () => $('resultsCount'),
  controlSection: () => $('controlSection'),
  controlGrid: () => $('controlGrid'),
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
const controlState = new Map();
let controlRefreshHandle = null;
const controlPendingActions = new Set();

function controlTokenStorageKey() {
  return CONTROL_CONFIG.actionTokenStorageKey || 'cheeze-control-action-token';
}

function readControlActionToken() {
  try {
    return window.sessionStorage.getItem(controlTokenStorageKey()) || '';
  } catch (error) {
    return '';
  }
}

function writeControlActionToken(token) {
  try {
    window.sessionStorage.setItem(controlTokenStorageKey(), token);
  } catch (error) {
    // Ignore storage failures and continue with the in-memory request.
  }
}

function clearControlActionToken() {
  try {
    window.sessionStorage.removeItem(controlTokenStorageKey());
  } catch (error) {
    // Ignore storage failures during cleanup.
  }
}

function showTokenDialog(serviceName, action) {
  return new Promise((resolve) => {
    const dialog = $('tokenDialog');
    const subEl = $('tokenDialogSub');
    const input = $('tokenInput');
    const eyeBtn = $('tokenEyeBtn');
    const confirmBtn = $('tokenConfirmBtn');
    const cancelBtn = $('tokenCancelBtn');

    const actionLabel = action === 'start' ? '시작' : action === 'stop' ? '종료' : action;
    subEl.textContent = `${serviceName} ${actionLabel}`;

    input.value = '';
    input.type = 'password';
    eyeBtn.querySelector('.eye-off').style.display = '';
    eyeBtn.querySelector('.eye-on').style.display = 'none';

    function finish(token) {
      dialog.close();
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKeydown);
      dialog.removeEventListener('cancel', onCancel);
      eyeBtn.removeEventListener('click', onEyeToggle);
      resolve(token);
    }

    function onConfirm() { finish(input.value.trim()); }
    function onCancel() { finish(''); }
    function onKeydown(e) { if (e.key === 'Enter') { e.preventDefault(); onConfirm(); } }

    function onEyeToggle() {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      eyeBtn.querySelector('.eye-off').style.display = isPassword ? 'none' : '';
      eyeBtn.querySelector('.eye-on').style.display = isPassword ? '' : 'none';
    }

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKeydown);
    dialog.addEventListener('cancel', onCancel, { once: true });
    eyeBtn.addEventListener('click', onEyeToggle);

    dialog.showModal();
    setTimeout(() => input.focus(), 50);
  });
}

async function resolveControlActionToken(serviceName, action) {
  if (!CONTROL_CONFIG.actionsRequireToken) return '';

  const existing = readControlActionToken();
  if (existing) return existing;

  const token = await showTokenDialog(serviceName || '', action || '');
  if (token) writeControlActionToken(token);
  return token;
}

function buildControlHeaders({ includeActionToken = false, token = '' } = {}) {
  const headers = {};

  if (includeActionToken && token) {
    headers[CONTROL_CONFIG.actionTokenHeader || 'X-Cheeze-Control-Token'] = token;
  }

  return headers;
}

function escapeHtml(value) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };

  return String(value).replace(/[&<>"']/g, (char) => map[char]);
}

function normalizeText(text) {
  return (text || '').toLowerCase().trim();
}

function initTheme() {
  const savedTheme = localStorage.getItem('edelweiss-theme');
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(savedTheme || systemTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('edelweiss-theme', theme);

  const button = $('themeToggle');
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
    .filter((service) => service.searchable !== false)
    .map((service) => ({ service, score: scoreService(service, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ service }) => service);
}

function renderResultCard(service) {
  const urlDisplay = service.url.replace(/^https?:\/\//, '');
  const bgVar = `--service-bg: ${service.bgColor || `${service.color}18`}`;

  return `
    <a href="${escapeHtml(service.url)}"
       class="result-card"
       target="_blank"
       rel="noopener noreferrer"
       style="${bgVar}; --service-color: ${service.color}">
      <div class="result-card-inner">
        ${renderIcon(service, 'md')}
        <div class="result-info">
          <div class="result-name">
            ${escapeHtml(service.name)}
            ${service.nameKo ? `<span class="result-name-ko">${escapeHtml(service.nameKo)}</span>` : ''}
            ${service.categoryIcon ? `<span class="result-category">${service.categoryIcon} ${escapeHtml(service.category)}</span>` : ''}
          </div>
          <div class="result-desc"><span class="result-desc-text">${escapeHtml(service.description)}</span></div>
          <div class="result-url">${escapeHtml(urlDisplay)}</div>
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
    <a href="${escapeHtml(service.url)}"
       class="quick-card"
       target="_blank"
       rel="noopener noreferrer"
       title="${escapeHtml(service.description)}"
       style="${bgVar}; --service-color: ${service.color}">
      ${renderIcon(service, 'lg')}
      ${service.onDemand ? '<span class="quick-card-ondemand" aria-label="온디맨드">ON</span>' : ''}
      <span class="quick-name">${escapeHtml(service.nameKo || service.name)}</span>
      <span class="quick-sub">${escapeHtml(service.name)}</span>
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

function ensureControlSection() {
  if ($('controlSection')) return;
  if (!CONTROL_CONFIG.enabled || !CONTROL_CONFIG.services.length) return;

  const quickAccess = els.quickAccess();
  if (!quickAccess || !quickAccess.parentNode) return;

  const section = document.createElement('section');
  section.id = 'controlSection';
  section.className = 'control-section';
  section.innerHTML = `
    <p class="section-label">On-Demand</p>
    <div class="control-grid" id="controlGrid"></div>
  `;

  quickAccess.parentNode.insertBefore(section, quickAccess.nextSibling);
}

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
      <div class="ai-disclaimer">AI는 정확하지 않을 수 있습니다. 중요한 내용은 재차 검토해 주세요.</div>
    </button>
    <div class="ai-response-card" id="aiResponseCard" hidden>
      <div class="ai-response-status" id="aiResponseStatus"></div>
      <div class="ai-response-body" id="aiResponseBody"></div>
      <div class="ai-disclaimer">AI는 정확하지 않을 수 있습니다. 중요한 내용은 재차 검토해 주세요.</div>
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

function isAiResponseVisible() {
  const responseCard = els.aiResponseCard();
  return Boolean(responseCard && !responseCard.hidden);
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
      let details = '';

      try {
        const errorPayload = await response.json();
        details = errorPayload.message || errorPayload.error || '';
      } catch (error) {
        details = '';
      }

      throw new Error(details || `AI request failed with ${response.status}`);
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
      : error.message || 'AI 호출에 실패했습니다. 게이트웨이의 /ai 프록시와 Ollama 상태를 확인하세요.';

    if (status) status.textContent = 'AI 요청 실패';
    if (body) body.textContent = message;
  } finally {
    window.clearTimeout(timeoutId);
    aiAbortController = null;
  }
}

function stateLabel(state) {
  const labels = {
    offline: '꺼짐',
    waking: '깨우는 중',
    starting: '켜는 중',
    running: '가동 중',
    stopping: '종료 중',
    error: '오류',
  };

  return labels[state] || '확인 중';
}

function stateClass(state) {
  return `is-${state || 'offline'}`;
}

function renderControlCard(service, state = {}) {
  const cardState = state.state || 'offline';
  const bgVar = `--service-bg: ${service.bgColor || `${service.color}18`}`;
  const busy = cardState === 'starting' || cardState === 'waking' || cardState === 'stopping';
  const canStart = cardState === 'offline' || cardState === 'error';
  const canStop = cardState === 'running' || cardState === 'starting' || cardState === 'waking' || cardState === 'stopping';
  const statusLine = state.message
    || (cardState === 'running'
      ? '접속 준비가 끝났습니다.'
      : cardState === 'offline'
        ? '필요할 때만 백엔드 PC를 깨워서 실행합니다.'
        : '백엔드 상태를 확인하는 중입니다.');

  return `
    <article class="control-card" data-service-id="${escapeHtml(service.id)}" style="${bgVar}; --service-color: ${service.color}">
      <div class="control-head">
        ${renderIcon(service, 'md')}
        <div class="control-info">
          <div class="control-title">
            <span>${escapeHtml(service.name)}</span>
            ${service.nameKo ? `<span class="control-name-ko">${escapeHtml(service.nameKo)}</span>` : ''}
            ${service.categoryIcon ? `<span class="control-category">${service.categoryIcon} ${escapeHtml(service.category)}</span>` : ''}
          </div>
          <p class="control-desc">${escapeHtml(service.description)}</p>
        </div>
        <span class="control-state-badge ${stateClass(cardState)}">${stateLabel(cardState)}</span>
      </div>
      <div class="control-meta">
        <div class="control-status-line">${escapeHtml(statusLine)}</div>
        <div class="control-actions">
          <button type="button" class="control-btn is-primary" data-action="start" ${canStart ? '' : 'disabled'}>시작</button>
          <button type="button" class="control-btn is-danger" data-action="stop" ${canStop ? '' : 'disabled'}>종료</button>
          <button type="button" class="control-btn" data-action="refresh" ${busy ? 'disabled' : ''}>새로고침</button>
        </div>
      </div>
    </article>
  `;
}

function renderControlGrid() {
  const grid = els.controlGrid();
  if (!grid) return;

  grid.innerHTML = CONTROL_CONFIG.services
    .map((service) => renderControlCard(service, controlState.get(service.id)))
    .join('');
}

function hasActiveControlTransition() {
  return CONTROL_CONFIG.services.some((service) => {
    const state = controlState.get(service.id)?.state;
    return state === 'starting' || state === 'stopping' || state === 'waking';
  });
}

function nextControlRefreshDelay() {
  return hasActiveControlTransition()
    ? (CONTROL_CONFIG.activeRefreshMs || 2000)
    : (CONTROL_CONFIG.refreshMs || 10000);
}

function scheduleControlRefresh() {
  if (!CONTROL_CONFIG.enabled || !CONTROL_CONFIG.services.length) return;

  if (controlRefreshHandle) {
    window.clearTimeout(controlRefreshHandle);
  }

  controlRefreshHandle = window.setTimeout(async () => {
    try {
      await refreshControlStates();
    } finally {
      scheduleControlRefresh();
    }
  }, nextControlRefreshDelay());
}

async function fetchControlState(serviceId) {
  const endpoint = `${CONTROL_CONFIG.endpoint.replace(/\/$/, '')}/services/${serviceId}`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`control status failed with ${response.status}`);
  }
  return response.json();
}

function parseJsonObject(rawPayload) {
  if (!rawPayload) return {};

  try {
    const parsed = JSON.parse(rawPayload);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function summarizeControlError(response, payload, rawPayload) {
  if (payload.message) return payload.message;
  if (payload.error) return payload.error;

  const trimmed = (rawPayload || '').trim();
  if (trimmed.startsWith('<')) {
    return `${CONTROL_CONFIG.endpoint} 경로가 JSON 대신 HTML 오류 페이지를 반환했습니다. gateway/nginx 프록시 설정과 portal API 배포 상태를 확인하세요.`;
  }

  if (trimmed) {
    return trimmed.slice(0, 180);
  }

  return `control action failed with ${response.status}`;
}

function normalizeControlActionError(error) {
  const message = String(error && error.message ? error.message : '').trim();

  if (!message) {
    return '서비스 제어 요청이 실패했습니다.';
  }

  if (message === 'ACTION_TOKEN_REQUIRED') {
    return '제어 토큰이 필요합니다. 토큰 입력을 취소했거나 비어 있습니다.';
  }

  if (message.includes('valid control action token is required')) {
    clearControlActionToken();
    return '관리자 제어 토큰이 없거나 올바르지 않습니다. 다시 입력하세요.';
  }

  if (message.includes('control actions are disabled until a portal action token is configured')) {
    return '게이트웨이에 제어 토큰이 아직 설정되지 않았습니다. portal API 서비스 환경변수를 확인하세요.';
  }

  if (message.startsWith('Unexpected')) {
    return `${CONTROL_CONFIG.endpoint} 응답이 JSON 형식이 아닙니다. gateway/nginx 프록시 또는 portal API 오류 페이지가 내려왔을 가능성이 큽니다.`;
  }

  if (message === 'Failed to fetch') {
    return 'portal control API에 연결하지 못했습니다. 네트워크, 프록시, 또는 gateway 서비스 상태를 확인하세요.';
  }

  return message;
}

async function refreshControlStates() {
  if (!CONTROL_CONFIG.enabled || !CONTROL_CONFIG.services.length) return;

  const results = await Promise.allSettled(
    CONTROL_CONFIG.services.map(async (service) => {
      const payload = await fetchControlState(service.id);
      return { serviceId: service.id, payload };
    })
  );

  results.forEach((result, index) => {
    const service = CONTROL_CONFIG.services[index];
    if (controlPendingActions.has(service.id)) {
      return;
    }

    if (result.status === 'fulfilled') {
      controlState.set(service.id, result.value.payload);
      return;
    }

    controlState.set(service.id, {
      state: 'error',
      message: '제어 API 상태를 읽지 못했습니다.',
    });
  });

  renderControlGrid();
}

async function invokeControlAction(serviceId, action) {
  const service = CONTROL_CONFIG.services.find((item) => item.id === serviceId);
  if (!service) return;

  if (action === 'refresh') {
    controlState.set(serviceId, {
      ...(controlState.get(serviceId) || {}),
      message: '상태를 다시 확인하는 중입니다...',
    });
    renderControlGrid();
    await refreshControlStates();
    return;
  }

  const endpoint = `${CONTROL_CONFIG.endpoint.replace(/\/$/, '')}/services/${serviceId}/${action}`;
  const actionToken = action === 'refresh' ? '' : await resolveControlActionToken(service.name || serviceId, action);
  if (CONTROL_CONFIG.actionsRequireToken && action !== 'refresh' && !actionToken) {
    controlState.set(serviceId, {
      ...(controlState.get(serviceId) || {}),
      state: 'error',
      message: normalizeControlActionError(new Error('ACTION_TOKEN_REQUIRED')),
    });
    renderControlGrid();
    return;
  }

  controlPendingActions.add(serviceId);

    controlState.set(serviceId, {
      ...(controlState.get(serviceId) || {}),
      state: action === 'start' ? 'waking' : 'stopping',
      message: action === 'start'
        ? '백엔드와 서비스 상태를 확인하는 중입니다...'
        : '서비스를 안전하게 종료하는 중입니다...',
    });
    renderControlGrid();
    scheduleControlRefresh();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildControlHeaders({
        includeActionToken: CONTROL_CONFIG.actionsRequireToken,
        token: actionToken,
      }),
    });
    const rawPayload = await response.text();
    const payload = parseJsonObject(rawPayload);

    if (!response.ok) {
      throw new Error(summarizeControlError(response, payload, rawPayload));
    }

    const wakeMessage = payload.wake_result && payload.wake_result.woke
      ? '백엔드 PC를 깨워 서비스를 시작하는 중입니다.'
      : action === 'start'
        ? '서비스 시작 명령이 전달됐습니다.'
        : '서비스 종료 명령이 전달됐습니다.';

    controlState.set(serviceId, {
      ...(controlState.get(serviceId) || {}),
      state: action === 'start' ? 'starting' : 'stopping',
      message: wakeMessage,
    });
    renderControlGrid();
    scheduleControlRefresh();
  } catch (error) {
    controlState.set(serviceId, {
      state: 'error',
      message: normalizeControlActionError(error),
    });
    renderControlGrid();
    scheduleControlRefresh();
  } finally {
    controlPendingActions.delete(serviceId);
    refreshControlStates().then(() => scheduleControlRefresh());
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
      const query = event.target.value;

      if (!query.trim() && isAiResponseVisible()) {
        syncQueryInputs('', 'followup');
        return;
      }

      showResults(query);
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

  const controlGrid = els.controlGrid();
  if (controlGrid) {
    controlGrid.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const card = button.closest('[data-service-id]');
      if (!card) return;
      const serviceId = card.getAttribute('data-service-id');
      const action = button.getAttribute('data-action');
      if (serviceId && action) invokeControlAction(serviceId, action);
    });
  }

  window.addEventListener('resize', () => syncResultDescOverflow());
  window.addEventListener('load', () => syncResultDescOverflow());

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => syncResultDescOverflow());
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  ensureAiSection();
  ensureControlSection();
  initQuickAccess();
  initEventListeners();

  if (window.innerWidth > 768 && els.input()) {
    els.input().focus();
  }

  if (CONTROL_CONFIG.enabled && CONTROL_CONFIG.services.length) {
    renderControlGrid();
    refreshControlStates().then(() => scheduleControlRefresh());
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && CONTROL_CONFIG.enabled && CONTROL_CONFIG.services.length) {
      refreshControlStates().then(() => scheduleControlRefresh());
    }
  });

  window.addEventListener('focus', () => {
    if (CONTROL_CONFIG.enabled && CONTROL_CONFIG.services.length) {
      refreshControlStates().then(() => scheduleControlRefresh());
    }
  });
});

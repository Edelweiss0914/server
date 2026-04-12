/**
 * CHEEZE — On-Demand 서버 페이지 로직
 */

const CONTROL_CONFIG = (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.control) || {
  enabled: false,
  endpoint: '/api/control',
  refreshMs: 10000,
  activeRefreshMs: 2000,
  services: [],
};

const $ = (id) => document.getElementById(id);

const serverState = new Map();
let refreshHandle = null;
const pendingActions = new Set();

// --- Token helpers (same as app.js) ---
function controlTokenStorageKey() { return CONTROL_CONFIG.actionTokenStorageKey || 'cheeze-control-action-token'; }
function readControlActionToken() { try { return window.sessionStorage.getItem(controlTokenStorageKey()) || ''; } catch(e) { return ''; } }
function writeControlActionToken(token) { try { window.sessionStorage.setItem(controlTokenStorageKey(), token); } catch(e) {} }
function clearControlActionToken() { try { window.sessionStorage.removeItem(controlTokenStorageKey()); } catch(e) {} }

// --- Theme (same as app.js) ---
function initTheme() {
  const saved = localStorage.getItem('edelweiss-theme');
  const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved || sys);
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('edelweiss-theme', theme);
  const btn = $('themeToggle');
  if (!btn) return;
  btn.setAttribute('aria-label', theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
  const sun = btn.querySelector('.icon-sun');
  const moon = btn.querySelector('.icon-moon');
  if (sun) sun.style.display = theme === 'dark' ? 'block' : 'none';
  if (moon) moon.style.display = theme === 'light' ? 'block' : 'none';
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

// --- Escape (same as app.js) ---
function escapeHtml(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(value).replace(/[&<>"']/g, (c) => map[c]);
}

// --- Token dialog (same as app.js showTokenDialog) ---
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

// --- State labels/classes (same as app.js) ---
function stateLabel(state) {
  const labels = { offline: '꺼짐', waking: '깨우는 중', starting: '켜는 중', running: '가동 중', stopping: '종료 중', error: '오류' };
  return labels[state] || '확인 중';
}
function stateClass(state) { return `is-${state || 'offline'}`; }

// --- Icon renderer (same as app.js renderIcon, size='lg') ---
function renderIcon(service) {
  const dim = 52, iconDim = 32;
  const bg = `var(--service-bg, ${service.bgColor || `${service.color}20`})`;
  if (service.iconType === 'emoji') {
    return `<div class="service-icon" style="width:${dim}px;height:${dim}px;background:${bg};font-size:26px">${service.icon}</div>`;
  }
  return `<div class="service-icon" style="width:${dim}px;height:${dim}px;background:${bg}"><div style="width:${iconDim}px;height:${iconDim}px;display:flex;align-items:center;justify-content:center;">${service.icon}</div></div>`;
}

// --- Card renderer ---
function renderSpeedIndicator(service, state) {
  if (!service.showSpeedIndicator) return '';
  const cardState = state.state || 'offline';
  let label, cls;
  if (cardState === 'running') {
    label = '현재 답변속도: 빠름'; cls = 'speed-fast';
  } else if (cardState === 'offline' || cardState === 'starting') {
    label = '현재 답변속도: 약간 시간 소요'; cls = 'speed-medium';
  } else {
    label = '현재 답변속도: 약 3~5분 소요'; cls = 'speed-slow';
  }
  return `<span class="server-speed-indicator ${cls}"><span class="speed-dot"></span>${label}</span>`;
}

function renderPlayerCount(state) {
  const pc = state.player_count;
  if (pc === null || pc === undefined) return '';
  const isEmpty = pc === 0;
  return `<span class="server-card-player-count${isEmpty ? ' is-empty' : ''}">
    <span class="player-dot"></span>${isEmpty ? '접속자 없음' : `접속자 ${pc}명`}
  </span>`;
}

function renderServerCard(service, state = {}) {
  const cardState = state.state || 'offline';
  const bgVar = `--service-bg: ${service.bgColor || `${service.color}18`}`;
  const busy = cardState === 'starting' || cardState === 'waking' || cardState === 'stopping';
  const canStart = cardState === 'offline' || cardState === 'error';
  const canStop = cardState === 'running' || cardState === 'starting' || cardState === 'waking' || cardState === 'stopping';
  const statusLine = state.message
    || (cardState === 'running' ? '접속 준비가 끝났습니다.'
      : cardState === 'offline' ? '필요할 때만 백엔드 PC를 깨워서 실행합니다.'
      : '백엔드 상태를 확인하는 중입니다.');

  return `
    <article class="server-card" data-service-id="${escapeHtml(service.id)}" style="${bgVar}; --service-color: ${service.color}">
      <div class="server-card-head">
        ${renderIcon(service)}
        <div class="server-card-info">
          <div class="server-card-title">
            <span>${escapeHtml(service.name)}</span>
            ${service.nameKo ? `<span class="server-card-ko">${escapeHtml(service.nameKo)}</span>` : ''}
            <span class="server-state-badge ${stateClass(cardState)}">${stateLabel(cardState)}</span>
          </div>
          <p class="server-card-desc">${escapeHtml(service.description)}</p>
        </div>
      </div>
      ${service.category ? `<div class="server-card-details"><span class="server-detail-chip">${service.categoryIcon ? escapeHtml(service.categoryIcon) + ' ' : ''}${escapeHtml(service.category)}</span></div>` : ''}
      <div class="server-card-status">${escapeHtml(statusLine)}</div>
      <div class="server-card-footer">
        ${service.showSpeedIndicator ? renderSpeedIndicator(service, state) : renderPlayerCount(state)}
        <div class="server-card-controls">
          <button type="button" class="control-btn is-primary" data-action="start" ${canStart ? '' : 'disabled'}>시작</button>
          <button type="button" class="control-btn is-danger" data-action="stop" ${canStop ? '' : 'disabled'}>종료</button>
          <button type="button" class="control-btn" data-action="refresh" ${busy ? 'disabled' : ''}>새로고침</button>
        </div>
      </div>
    </article>
  `;
}

function renderGrid() {
  const grid = $('serverGrid');
  if (!grid) return;
  if (!CONTROL_CONFIG.enabled || !CONTROL_CONFIG.services.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">등록된 온디맨드 서버가 없습니다.</p>';
    return;
  }
  grid.innerHTML = CONTROL_CONFIG.services
    .map((service) => renderServerCard(service, serverState.get(service.id)))
    .join('');
}

function hasActiveTransition() {
  return CONTROL_CONFIG.services.some((s) => {
    const st = serverState.get(s.id)?.state;
    return st === 'starting' || st === 'stopping' || st === 'waking';
  });
}

function scheduleRefresh() {
  if (!CONTROL_CONFIG.enabled || !CONTROL_CONFIG.services.length) return;
  if (refreshHandle) window.clearTimeout(refreshHandle);
  refreshHandle = window.setTimeout(async () => {
    try { await refreshAllStates(); } finally { scheduleRefresh(); }
  }, hasActiveTransition() ? (CONTROL_CONFIG.activeRefreshMs || 2000) : (CONTROL_CONFIG.refreshMs || 10000));
}

async function fetchControlState(serviceId) {
  const endpoint = `${CONTROL_CONFIG.endpoint.replace(/\/$/, '')}/services/${serviceId}`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

async function refreshAllStates() {
  if (!CONTROL_CONFIG.enabled || !CONTROL_CONFIG.services.length) return;
  const results = await Promise.allSettled(
    CONTROL_CONFIG.services.map(async (s) => ({ serviceId: s.id, payload: await fetchControlState(s.id) }))
  );
  results.forEach((result, i) => {
    const service = CONTROL_CONFIG.services[i];
    if (pendingActions.has(service.id)) return;
    if (result.status === 'fulfilled') {
      serverState.set(service.id, result.value.payload);
    } else {
      serverState.set(service.id, { state: 'error', message: '제어 API 상태를 읽지 못했습니다.' });
    }
  });
  renderGrid();
}

function parseJsonObject(raw) {
  if (!raw) return {};
  try { const p = JSON.parse(raw); return (p && typeof p === 'object') ? p : {}; } catch(e) { return {}; }
}

function summarizeError(response, payload, raw) {
  if (payload.message) return payload.message;
  if (payload.error) return payload.error;
  const t = (raw || '').trim();
  if (t.startsWith('<')) return `${CONTROL_CONFIG.endpoint} 경로가 JSON 대신 HTML 오류 페이지를 반환했습니다.`;
  if (t) return t.slice(0, 180);
  return `control action failed with ${response.status}`;
}

function normalizeError(error) {
  const msg = String(error && error.message ? error.message : '').trim();
  if (!msg) return '서비스 제어 요청이 실패했습니다.';
  if (msg === 'ACTION_TOKEN_REQUIRED') return '제어 토큰이 필요합니다. 토큰 입력을 취소했거나 비어 있습니다.';
  if (msg.includes('valid control action token is required')) { clearControlActionToken(); return '관리자 제어 토큰이 없거나 올바르지 않습니다. 다시 입력하세요.'; }
  if (msg.includes('Failed to fetch')) return 'portal control API에 연결하지 못했습니다.';
  return msg;
}

async function invokeControlAction(serviceId, action) {
  const service = CONTROL_CONFIG.services.find((s) => s.id === serviceId);
  if (!service) return;

  if (action === 'refresh') {
    serverState.set(serviceId, { ...(serverState.get(serviceId) || {}), message: '상태를 다시 확인하는 중입니다...' });
    renderGrid();
    await refreshAllStates();
    return;
  }

  const actionToken = await resolveControlActionToken(service.name || serviceId, action);
  if (CONTROL_CONFIG.actionsRequireToken && !actionToken) {
    serverState.set(serviceId, { ...(serverState.get(serviceId) || {}), state: 'error', message: normalizeError(new Error('ACTION_TOKEN_REQUIRED')) });
    renderGrid();
    return;
  }

  pendingActions.add(serviceId);
  serverState.set(serviceId, {
    ...(serverState.get(serviceId) || {}),
    state: action === 'start' ? 'waking' : 'stopping',
    message: action === 'start' ? '백엔드와 서비스 상태를 확인하는 중입니다...' : '서비스를 안전하게 종료하는 중입니다...',
  });
  renderGrid();
  scheduleRefresh();

  try {
    const endpoint = `${CONTROL_CONFIG.endpoint.replace(/\/$/, '')}/services/${serviceId}/${action}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildControlHeaders({ includeActionToken: CONTROL_CONFIG.actionsRequireToken, token: actionToken }),
    });
    const raw = await response.text();
    const payload = parseJsonObject(raw);
    if (!response.ok) throw new Error(summarizeError(response, payload, raw));
    const wakeMsg = payload.wake_result && payload.wake_result.woke
      ? '백엔드 PC를 깨워 서비스를 시작하는 중입니다.'
      : action === 'start' ? '서비스 시작 명령이 전달됐습니다.' : '서비스 종료 명령이 전달됐습니다.';
    serverState.set(serviceId, { ...(serverState.get(serviceId) || {}), state: action === 'start' ? 'starting' : 'stopping', message: wakeMsg });
    renderGrid();
    scheduleRefresh();
  } catch (error) {
    serverState.set(serviceId, { state: 'error', message: normalizeError(error) });
    renderGrid();
    scheduleRefresh();
  } finally {
    pendingActions.delete(serviceId);
    refreshAllStates().then(() => scheduleRefresh());
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  renderGrid();

  const themeToggle = $('themeToggle');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

  const grid = $('serverGrid');
  if (grid) {
    grid.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const card = button.closest('[data-service-id]');
      if (!card) return;
      const serviceId = card.getAttribute('data-service-id');
      const action = button.getAttribute('data-action');
      if (serviceId && action) invokeControlAction(serviceId, action);
    });
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('edelweiss-theme')) applyTheme(e.matches ? 'dark' : 'light');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshAllStates().then(() => scheduleRefresh());
  });

  window.addEventListener('focus', () => refreshAllStates().then(() => scheduleRefresh()));

  if (CONTROL_CONFIG.enabled && CONTROL_CONFIG.services.length) {
    refreshAllStates().then(() => scheduleRefresh());
  }
});

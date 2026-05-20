const API = location.origin;
const root = document.getElementById('app-root');
const toastRoot = document.getElementById('toast-root');

const storage = {
  token: 'smarthome_token',
  user: 'smarthome_user',
};

const COMMAND_INTERVAL_MS = 1200;
const GARAGE_OPEN_WARN_MS = 120000;

const iconPaths = {
  home: '<path d="m3 10.5 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  door: '<path d="M14 12h.01"/><path d="M18 20V6a2 2 0 0 0-2-2H8v16"/><path d="M2 20h20"/>',
  garage: '<path d="M3 21V9l9-6 9 6v12"/><path d="M7 21v-8h10v8"/><path d="M7 17h10"/>',
  light: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M8.5 14a6 6 0 1 1 7 0c-.8.6-1.5 1.6-1.5 2.5h-4c0-.9-.7-1.9-1.5-2.5z"/>',
  fan: '<path d="M12 12h.01"/><path d="M12 12c-2-4-1-8 2-8 2 0 3 2 2 4-1 2-3 3-4 4z"/><path d="M12 12c4-2 8-1 8 2 0 2-2 3-4 2-2-1-3-3-4-4z"/><path d="M12 12c-2 4-6 5-8 2-1-2 0-4 2-4 2 0 4 1 6 2z"/>',
  thermometer: '<path d="M14 14.8V5a4 4 0 0 0-8 0v9.8a6 6 0 1 0 8 0z"/>',
  droplet: '<path d="M12 2.5S5 10 5 15a7 7 0 0 0 14 0c0-5-7-12.5-7-12.5z"/>',
  activity: '<path d="M22 12h-4l-3 8-6-16-3 8H2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  wifi: '<path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M12 20h.01"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-7"/>',
  logs: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.3 7A2 2 0 1 1 7.1 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  sync: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 16h5v5"/><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8"/><path d="M21 8h-5V3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
};

const navigation = [
  { id: 'overview', label: 'Overview', icon: 'home' },
  { id: 'controls', label: 'Controls', icon: 'power' },
  { id: 'access', label: 'Access', icon: 'shield' },
  { id: 'analytics', label: 'Analytics', icon: 'chart' },
  { id: 'logs', label: 'Logs', icon: 'logs' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

let state = {
  token: localStorage.getItem(storage.token) || '',
  user: readJson(localStorage.getItem(storage.user), null),
  activePage: 'overview',
  sidebarOpen: false,
  esp32: { status: 'reconnecting', lastSeen: null },
  sensor: null,
  sensorHistory: [],
  dailyStats: [],
  stats: mockStats(),
  events: mockEvents(),
  pendingCommand: null,
  commandLockedUntil: 0,
  commandUnlockRenderAt: 0,
  lastFormEditAt: 0,
  desiredFan: null,
  desiredLight: null,
  dialog: null,
  login: { loading: false, error: '' },
  forms: {
    doorAutoClose: 30,
    lightBrightness: 70,
    lightEffect: 'Static',
    lightHold: 15,
    fanMode: 'manual',
    fanDir: 1,
    fanSpeed: 60,
    temperatureOnThreshold: 32,
    temperatureOffThreshold: 29,
    humidityOnThreshold: 78,
    humidityOffThreshold: 70,
    timeFilter: 'today',
  },
  accessCards: mockAccessCards(),
  passwords: mockPasswords(),
  eventSource: null,
};
state.sensor = mockSensor();

document.addEventListener('DOMContentLoaded', boot);

function boot() {
  render();
  if (state.token && state.user) startRealtime();
  setInterval(() => {
    if (state.token) refreshAll();
  }, 5000);
  setInterval(renderCommandButtonsOnly, 250);
}

function readJson(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

function h(strings, ...values) {
  return strings.reduce((out, part, i) => out + part + (values[i] ?? ''), '');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[c]));
}

function icon(name, size = 20) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.activity}</svg>`;
}

function cls(...values) {
  return values.filter(Boolean).join(' ');
}

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = text;
  try { body = text ? JSON.parse(text) : {}; } catch {}
  if (!res.ok) throw new Error(typeof body === 'string' ? body : (body.error || `HTTP ${res.status}`));
  return body;
}

function setState(patch, shouldRender = true) {
  state = { ...state, ...patch };
  if (shouldRender) render();
}

function render() {
  root.innerHTML = state.token && state.user ? AppLayout() : LoginPage();
  bindEvents();
}

function AppLayout() {
  return h`
    <div class="app-shell ${state.sidebarOpen ? 'sidebar-open' : ''}">
      ${Sidebar()}
      <div class="scrim" data-action="close-sidebar"></div>
      <main class="main-shell">
        ${Topbar()}
        <section class="page-shell">${renderPage()}</section>
      </main>
      ${MobileNav()}
      ${state.dialog ? ModalDialog(state.dialog) : ''}
    </div>
  `;
}

function Sidebar() {
  return h`
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="brand-mark">${icon('home', 22)}</div>
        <div>
          <strong>SmartHome</strong>
          <span>ESP32 Control</span>
        </div>
      </div>
      <nav class="sidebar-nav">
        ${navigation.map(item => h`
          <button class="${cls('nav-item', state.activePage === item.id && 'is-active')}" data-nav="${item.id}">
            ${icon(item.icon, 19)}<span>${item.label}</span>
          </button>
        `).join('')}
      </nav>
      <div class="sidebar-footer">
        ${StatusBadge()}
        <button class="btn btn-ghost full-width" data-action="logout">${icon('logout', 17)}Đăng xuất</button>
      </div>
    </aside>
  `;
}

function Topbar() {
  const titleMap = {
    overview: 'Tổng quan hệ thống',
    controls: 'Điều khiển thiết bị',
    access: 'Quản lý truy cập',
    analytics: 'Dữ liệu và thống kê',
    logs: 'Lịch sử sự kiện',
    settings: 'Cấu hình hệ thống',
  };
  return h`
    <header class="topbar">
      <button class="icon-btn menu-btn" data-action="open-sidebar" title="Mở menu">${icon('menu')}</button>
      <div>
        <p class="eyebrow">SmartHome Control Center</p>
        <h1>${titleMap[state.activePage]}</h1>
      </div>
      <div class="topbar-actions">
        ${StatusBadge()}
        <span class="user-chip">${icon('shield', 16)}${escapeHtml(state.user?.displayName || state.user?.username || 'Chủ nhà')}</span>
        <button class="btn btn-ghost hide-sm" data-action="logout">${icon('logout', 17)}Đăng xuất</button>
      </div>
    </header>
  `;
}

function MobileNav() {
  return h`
    <nav class="mobile-nav">
      ${navigation.slice(0, 5).map(item => h`
        <button class="${cls(state.activePage === item.id && 'is-active')}" data-nav="${item.id}">
          ${icon(item.icon, 19)}<span>${item.label}</span>
        </button>
      `).join('')}
    </nav>
  `;
}

function StatusBadge() {
  const connected = state.esp32.status === 'online';
  const reconnecting = state.esp32.status === 'reconnecting';
  const text = connected ? 'ESP32 online' : reconnecting ? 'Đang kết nối lại' : 'ESP32 offline';
  return `<span class="${cls('status-badge', connected ? 'success' : reconnecting ? 'warning' : 'danger')}">${icon(connected ? 'wifi' : reconnecting ? 'sync' : 'wifi', 16)}${text}</span>`;
}

function renderPage() {
  const pages = {
    overview: OverviewPage,
    controls: ControlsPage,
    access: AccessManagementPage,
    analytics: AnalyticsPage,
    logs: LogsPage,
    settings: SettingsPage,
  };
  return (pages[state.activePage] || OverviewPage)();
}

function LoginPage() {
  return h`
    <main class="login-page">
      <section class="login-visual">
        ${SmartHomeIllustration('login')}
        <div>
          <p class="eyebrow">ESP32 IoT Dashboard</p>
          <h1>SmartHome Control Center</h1>
          <p class="login-copy">Điều khiển cửa, gara, đèn, quạt và theo dõi dữ liệu realtime trong một giao diện an toàn, rõ ràng.</p>
        </div>
      </section>
      <section class="login-panel">
        <div class="login-card">
          <div class="brand-mark">${icon('home', 24)}</div>
          <h2>Đăng nhập</h2>
          <p class="muted">Nhập ID và mật khẩu web app để truy cập hệ thống.</p>
          <form id="login-form" class="form-stack">
            <label>ID người dùng
              <input id="login-username" autocomplete="username" placeholder="admin" required>
            </label>
            <label>Mật khẩu
              <input id="login-password" type="password" autocomplete="current-password" placeholder="Mật khẩu" required>
            </label>
            <button class="btn btn-primary full-width" type="submit" ${state.login.loading ? 'disabled' : ''}>
              ${state.login.loading ? '<span class="spinner"></span>Đang đăng nhập' : `${icon('unlock', 18)}Đăng nhập`}
            </button>
            <div class="error-line">${escapeHtml(state.login.error)}</div>
          </form>
        </div>
      </section>
    </main>
  `;
}

function OverviewPage() {
  const events = state.events.slice(0, 5);
  return h`
    <div class="page-grid overview-grid">
      <section class="hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">Trạng thái ngôi nhà</p>
          <h2>${homeMoodText()}</h2>
          <p class="muted">${state.esp32.status === 'online' ? 'Realtime đang hoạt động. Các thay đổi từ ESP32 sẽ cập nhật ngay trên dashboard.' : 'ESP32 chưa sẵn sàng. Các lệnh trực tiếp đang được khóa để tránh thao tác lỗi.'}</p>
        </div>
        ${SmartHomeIllustration('hero')}
        <div class="hero-status">${StatusBadge()}</div>
      </section>
      <div class="overview-cards">
        ${DeviceStatusCard({ title: 'Cửa chính', iconName: 'door', stateText: displayState('door', state.sensor.door), tone: toneForDoor(state.sensor.door), description: doorDescription(), action: 'Xem điều khiển', page: 'controls' })}
        ${DeviceStatusCard({ title: 'Gara', iconName: 'garage', stateText: displayState('garage', state.sensor.gara), tone: toneForGarage(state.sensor.gara), description: `Khoảng cách ${formatDistance(state.sensor.dist)} · ${displayMode(state.sensor.garageMode || 'AUTO')}`, action: 'Mở trang gara', page: 'controls' })}
        ${DeviceStatusCard({ title: 'Đèn hành lang', iconName: 'light', stateText: state.sensor.lightOn ? 'Bật' : 'Tắt', tone: state.sensor.lightOn ? 'success' : 'neutral', description: `Chế độ ${displayMode(state.sensor.lightMode)}`, action: 'Điều chỉnh', page: 'controls' })}
        ${DeviceStatusCard({ title: 'Quạt môi trường', iconName: 'fan', stateText: `${displayState('fan', state.sensor.fan)} · ${state.sensor.fanPct || 0}%`, tone: state.sensor.fan && state.sensor.fan !== 'OFF' ? 'success' : 'neutral', description: `Chế độ ${displayMode(state.sensor.fanMode)}`, action: 'Cấu hình', page: 'controls' })}
      </div>
      <section class="card span-2">
        <div class="section-head">
          <div><p class="eyebrow">Sensor realtime</p><h3>Dữ liệu hiện tại</h3></div>
          <span class="pill">${escapeHtml(state.sensor.time || 'Mock fallback')}</span>
        </div>
        <div class="metric-grid">
          ${SensorMetricCard('Nhiệt độ', `${valueOrDash(state.sensor.temp)}°C`, 'DHT11', 'thermometer', sensorTone('temp'))}
          ${SensorMetricCard('Độ ẩm', `${valueOrDash(state.sensor.humidity)}%`, 'DHT11', 'droplet', sensorTone('humidity'))}
          ${SensorMetricCard('Chuyển động', state.sensor.motion ? 'Có' : 'Không', state.sensor.motion ? 'Đang phát hiện IR/PIR' : 'Không có tín hiệu', 'activity', state.sensor.motion ? 'warning' : 'neutral')}
          ${SensorMetricCard('Khoảng cách gara', formatDistance(state.sensor.dist), garageDistanceText(), 'garage', distanceTone())}
        </div>
      </section>
      <section class="card">
        <div class="section-head">
          <div><p class="eyebrow">Quick actions</p><h3>Thao tác nhanh</h3></div>
        </div>
        <div class="quick-actions">
          ${ActionButton('Mở cửa chính', 'door-open', 'unlock', true)}
          ${ActionButton('Đóng cửa chính', 'door-close', 'lock', false)}
          ${ActionButton('Mở gara', 'garage-open', 'garage', true)}
          ${ActionButton('Đóng gara', 'garage-close', 'garage', false)}
        </div>
      </section>
      <section class="card">
        <div class="section-head">
          <div><p class="eyebrow">Sự kiện gần nhất</p><h3>Event timeline</h3></div>
          <button class="btn btn-ghost" data-nav="logs">Xem tất cả</button>
        </div>
        ${EventTimeline(events, true)}
      </section>
    </div>
  `;
}

function SmartHomeIllustration(variant = 'hero') {
  return h`
    <div class="smart-home-art ${variant}" aria-hidden="true">
      <svg viewBox="0 0 520 360" role="img">
        <defs>
          <linearGradient id="homeWall${variant}" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stop-color="#f4fffb"/>
            <stop offset="100%" stop-color="#bff7e6"/>
          </linearGradient>
          <linearGradient id="homeRoof${variant}" x1="0" x2="1">
            <stop offset="0%" stop-color="#0f6f58"/>
            <stop offset="100%" stop-color="#24b58a"/>
          </linearGradient>
          <filter id="homeShadow${variant}" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="18" stdDeviation="16" flood-color="#062d25" flood-opacity=".22"/>
          </filter>
        </defs>
        <path class="art-cloud cloud-a" d="M64 112c12-24 48-28 65-8 18-12 45-4 52 17 21 2 36 17 36 35H38c0-23 13-39 26-44z"/>
        <path class="art-cloud cloud-b" d="M356 74c10-19 39-22 53-6 15-10 37-3 43 14 17 2 29 14 29 29H335c0-19 10-32 21-37z"/>
        <g filter="url(#homeShadow${variant})">
          <path class="art-roof" d="M83 178 260 55l177 123h-54L260 96 137 178z" fill="url(#homeRoof${variant})"/>
          <path class="art-wall" d="M122 174h276v132c0 18-14 32-32 32H154c-18 0-32-14-32-32z" fill="url(#homeWall${variant})"/>
          <path class="art-garage" d="M278 236h88v102h-88z"/>
          <path class="art-garage-line" d="M292 258h60M292 280h60M292 302h60"/>
          <path class="art-door" d="M171 230h58v108h-58z"/>
          <circle class="art-knob" cx="218" cy="286" r="4"/>
          <rect class="art-window" x="158" y="188" width="72" height="54" rx="14"/>
          <rect class="art-window" x="285" y="188" width="72" height="54" rx="14"/>
          <path class="art-window-line" d="M194 188v54M158 215h72M321 188v54M285 215h72"/>
        </g>
        <path class="signal-ring ring-a" d="M260 25a68 68 0 0 1 68 68"/>
        <path class="signal-ring ring-b" d="M260 50a43 43 0 0 1 43 43"/>
        <circle class="signal-dot" cx="260" cy="93" r="7"/>
        <g class="device-bubbles">
          <circle cx="111" cy="250" r="24"/>
          <circle cx="420" cy="229" r="24"/>
          <circle cx="398" cy="310" r="24"/>
        </g>
        <path class="bubble-icon" d="M101 250h20M111 240v20M412 229a8 8 0 1 0 16 0 8 8 0 0 0-16 0zM392 310h12l6-16 12 32 6-16h10"/>
      </svg>
    </div>
  `;
}

function ControlsPage() {
  return h`
    <div class="control-layout">
      ${ControlPanelCard('Cửa chính', 'door', h`
        <div class="state-line"><strong>${displayState('door', state.sensor.door)}</strong><span>${doorDescription()}</span></div>
        ${state.sensor.door === 'LOCKED_OUT' ? '<div class="alert danger">Hệ thống đang lockout do nhập sai quá nhiều lần.</div>' : ''}
        <div class="control-row">
          ${ActionButton('Mở cửa chính', 'door-open', 'unlock', true)}
          ${ActionButton('Đóng cửa chính', 'door-close', 'lock', false)}
        </div>
        <label>Thời gian tự đóng (giây)
          <input data-form="doorAutoClose" type="number" min="5" max="600" value="${state.forms.doorAutoClose}">
        </label>
        <button class="btn btn-secondary" data-command-action="unlock-lockout">${icon('shield', 18)}Giải khóa truy cập</button>
      `)}
      ${ControlPanelCard('Gara', 'garage', h`
        <div class="state-line"><strong>${displayState('garage', state.sensor.gara)}</strong><span>${formatDistance(state.sensor.dist)} · ngưỡng 7cm</span></div>
        ${garageOpenTooLong() ? '<div class="alert warning">Gara đang mở lâu hơn 2 phút. Hãy kiểm tra trước khi rời nhà.</div>' : ''}
        ${ModeSwitch('garage', state.sensor.garageMode, [
          ['AUTO', 'Tự động', 'garage-auto'],
          ['MANUAL', 'Thủ công', 'garage-manual'],
        ])}
        <div class="control-row">
          ${ActionButton('Mở gara', 'garage-open', 'garage', true)}
          ${ActionButton('Đóng gara', 'garage-close', 'garage', false)}
        </div>
      `)}
      ${ControlPanelCard('Đèn hành lang', 'light', h`
        <div class="state-line"><strong>${state.sensor.lightOn ? 'Bật' : 'Tắt'}</strong><span>Chế độ ${displayMode(state.sensor.lightMode)} · ${state.sensor.lightBrightness || state.forms.lightBrightness}%</span></div>
        <div class="light-preview ${state.sensor.lightOn ? 'is-on' : ''}" style="--brightness:${state.forms.lightBrightness}">
          <span>${icon('light', 18)}</span>
          <div><strong>${state.forms.lightBrightness}%</strong><small>${effectLabel(state.forms.lightEffect)} · giữ ${state.forms.lightHold}s</small></div>
        </div>
        ${ModeSwitch('light', state.sensor.lightMode, [
          ['AUTO', 'Tự động', 'light-auto'],
          ['MANUAL', 'Thủ công', 'light-manual'],
        ])}
        <div class="control-row">
          ${ActionButton('Bật đèn', 'light-on', 'light', false)}
          ${ActionButton('Tắt đèn', 'light-off', 'power', false)}
        </div>
        <label>Độ sáng tối đa: <strong>${state.forms.lightBrightness}%</strong>
          <input data-form="lightBrightness" type="range" min="10" max="100" value="${state.forms.lightBrightness}">
        </label>
        <label>Hiệu ứng LED
          <select data-form="lightEffect">${['Static', 'Blink', 'Fading'].map(v => `<option ${state.forms.lightEffect === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </label>
        <label>Thời gian chờ tối thiểu (giây)
          <input data-form="lightHold" type="number" min="1" max="600" value="${state.forms.lightHold}">
        </label>
        <p class="hint">Ở chế độ tự động, đèn sẽ bật khi phát hiện chuyển động.</p>
        <button class="btn btn-primary full-width" data-command-action="light-settings">${icon('settings', 18)}Lưu cấu hình đèn</button>
      `)}
      ${ControlPanelCard('Quạt môi trường', 'fan', h`
        <div class="state-line"><strong>${displayState('fan', state.sensor.fan)} · ${state.sensor.fanPct || 0}%</strong><span>Chế độ ${displayMode(state.sensor.fanMode)}</span></div>
        <div class="form-grid two">
          <label>Chế độ
            <select data-form="fanMode">
              ${option('auto', 'Tự động', state.forms.fanMode)}
              ${option('manual', 'Thủ công', state.forms.fanMode)}
              ${option('off', 'Tắt', state.forms.fanMode)}
            </select>
          </label>
          <label>Hướng quay
            <select data-form="fanDir">
              ${option(1, 'Thuận', state.forms.fanDir)}
              ${option(-1, 'Ngược', state.forms.fanDir)}
              ${option(0, 'Dừng', state.forms.fanDir)}
            </select>
          </label>
        </div>
        <label>Tốc độ quạt: <strong>${state.forms.fanSpeed}%</strong>
          <input data-form="fanSpeed" type="range" min="0" max="100" value="${state.forms.fanSpeed}">
        </label>
        <div class="threshold-grid">
          ${NumberInput('temperatureOnThreshold', 'Nhiệt bật', '°C')}
          ${NumberInput('temperatureOffThreshold', 'Nhiệt tắt', '°C')}
          ${NumberInput('humidityOnThreshold', 'Ẩm bật', '%')}
          ${NumberInput('humidityOffThreshold', 'Ẩm tắt', '%')}
        </div>
        <p class="hint">Quạt bật khi nhiệt độ hoặc độ ẩm vượt ngưỡng, và tắt khi cả hai đã ổn định.</p>
        <div class="control-row">
          <button class="btn btn-secondary" data-command-action="fan-settings">${icon('settings', 18)}Lưu ngưỡng</button>
          <button class="btn btn-primary" data-command-action="fan-apply">${icon('fan', 18)}Áp dụng quạt</button>
        </div>
      `)}
    </div>
  `;
}

function AccessManagementPage() {
  return h`
    <div class="page-grid access-grid">
      <section class="card span-2">
        <div class="section-head">
          <div><p class="eyebrow">RFID Cards</p><h3>Thẻ truy cập</h3></div>
          <div class="control-row tight">
            <button class="btn btn-secondary" data-command-action="create-card-manual">${icon('plus', 18)}Thêm thủ công</button>
            <button class="btn btn-primary" data-command-action="add-card-mode">${icon('sync', 18)}Add Card Mode</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Tên thẻ</th><th>UID</th><th>Target</th><th>Hiệu lực</th><th>Trạng thái</th><th>UpdatedAt</th><th></th></tr></thead>
            <tbody>${state.accessCards.map(card => h`
              <tr>
                <td><strong>${escapeHtml(card.name)}</strong></td>
                <td><code>${escapeHtml(card.uid)}</code></td>
                <td>${targetLabel(card.target)}</td>
                <td>${AccessPolicyView(card)}</td>
                <td><span class="pill ${card.enabled ? 'success' : ''}">${card.enabled ? 'Enabled' : 'Disabled'}</span></td>
                <td>${card.updatedAt}</td>
                <td class="row-actions"><button class="icon-btn" data-card-edit="${card.id}" title="Đổi tên">${icon('settings', 16)}</button><button class="icon-btn danger" data-card-delete="${card.id}" title="Xóa">${icon('trash', 16)}</button></td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
      </section>
      <section class="card">
        <div class="section-head"><div><p class="eyebrow">Keypad</p><h3>Mật khẩu truy cập</h3></div><button class="btn btn-secondary" data-command-action="create-password">${icon('plus', 18)}Tạo mật khẩu</button></div>
        <div class="stack-list">
          ${state.passwords.map(p => h`
            <div class="list-card">
              <div><strong>${escapeHtml(p.name)}</strong><span>${p.type} · ${targetLabel(p.target)}</span>${AccessPolicyView(p)}</div>
              <span class="pill status-pill ${p.status === 'active' ? 'success' : p.status === 'expired' ? 'danger' : ''}">${p.status}</span>
              ${p.type === 'master' ? '' : `<button class="icon-btn danger" data-password-delete="${p.id}" title="Xóa">${icon('trash', 15)}</button>`}
            </div>
          `).join('')}
        </div>
        <p class="hint">Dashboard không hiển thị password plain text sau khi tạo.</p>
      </section>
      <section class="card">
        <div class="section-head"><div><p class="eyebrow">Access Logs</p><h3>Log truy cập</h3></div></div>
        <div class="filter-row">
          <select><option>source: tất cả</option><option>rfid</option><option>keypad</option><option>web_app</option></select>
          <select><option>target: tất cả</option><option>mainDoor</option><option>garageDoor</option></select>
          <select><option>type: tất cả</option><option>success</option><option>failed</option><option>lockout</option></select>
        </div>
        ${EventTimeline(state.events.filter(e => ['access_success', 'access_failed', 'access_lockout', 'remote_command'].includes(e.type)).slice(0, 8))}
      </section>
    </div>
  `;
}

function AnalyticsPage() {
  return h`
    <div class="page-grid">
      <section class="card span-2">
        <div class="section-head">
          <div><p class="eyebrow">Bộ lọc thời gian</p><h3>Phân tích vận hành</h3></div>
          <div class="segmented compact">${['today', '7d', '30d', 'custom'].map(v => `<button data-filter="${v}" class="${state.forms.timeFilter === v ? 'is-active' : ''}">${filterLabel(v)}</button>`).join('')}</div>
        </div>
        <div class="stat-grid">
          ${StatCard('Mở cửa chính', state.stats.unlocks || 0, 'lần hôm nay', 'door')}
          ${StatCard('Mở gara', state.stats.garageEvents || 0, 'lần hôm nay', 'garage')}
          ${StatCard('Nhập sai', state.stats.failedAccess || state.stats.failedCommands || 0, 'lần truy cập lỗi', 'shield')}
          ${StatCard('Lockout', state.stats.lockouts || 0, 'cảnh báo', 'lock')}
        </div>
      </section>
      ${ChartCard('Nhiệt độ theo giờ', '°C', hourlyStatSeries('avgTemperature', 'temp'), 'thermometer')}
      ${ChartCard('Độ ẩm theo giờ', '%', hourlyStatSeries('avgHumidity', 'humidity'), 'droplet')}
      ${ChartCard('Thời gian bật quạt theo ngày', 'phút', dailyStatSeries('fanOnMinutes', 'fanMinutes'), 'fan', true)}
      ${ChartCard('Thời gian bật đèn theo ngày', 'phút', dailyStatSeries('lightOnMinutes', 'lightMinutes'), 'light', true)}
    </div>
  `;
}

function LogsPage() {
  return h`
    <section class="card">
      <div class="section-head">
        <div><p class="eyebrow">Event Timeline</p><h3>Lịch sử hệ thống</h3></div>
        <button class="btn btn-secondary" data-action="refresh">${icon('sync', 18)}Làm mới</button>
      </div>
      <div class="filter-row">
        <select><option>event type: tất cả</option><option>access_success</option><option>access_failed</option><option>device_state_changed</option></select>
        <select><option>target: tất cả</option><option>mainDoor</option><option>garageDoor</option><option>hallwayLight</option></select>
        <select><option>source: tất cả</option><option>rfid</option><option>keypad</option><option>web_app</option><option>system</option></select>
        <input type="date">
      </div>
      ${EventTimeline(state.events)}
    </section>
  `;
}

function SettingsPage() {
  return h`
    <div class="settings-grid">
      ${SettingsCard('Cấu hình hệ thống', [['Tên hệ thống', 'SmartHome Control Center'], ['Timezone', 'Asia/Ho_Chi_Minh'], ['Config version', 'v1.0.0']])}
      ${SettingsCard('Lockout', [['Số lần sai trước khi khóa', '5'], ['Thời gian khóa ban đầu', '30 giây'], ['Hệ số nhân thời gian khóa', '2x']])}
      ${SettingsCard('Offline sync', [['Offline mode', 'Bật'], ['Event lưu tạm tối đa', '500'], ['Sync policy', 'Khi ESP32 online']])}
      <section class="card">
        <div class="section-head"><div><p class="eyebrow">ESP32</p><h3>Thiết bị gateway</h3></div>${StatusBadge()}</div>
        <div class="settings-list">
          <div><span>Device ID</span><strong>esp32-main</strong></div>
          <div><span>Online status</span><strong>${state.esp32.status}</strong></div>
          <div><span>Last seen</span><strong>${escapeHtml(state.esp32.lastSeen || state.sensor.time || 'Chưa có')}</strong></div>
          <div><span>Firmware version</span><strong>Chưa báo cáo</strong></div>
        </div>
        <button class="btn btn-primary full-width" data-command-action="sync">${icon('sync', 18)}Sync config</button>
      </section>
      <section class="card span-2">
        <div class="section-head"><div><p class="eyebrow">Web account</p><h3>Tài khoản web app</h3></div></div>
        <div class="settings-list two-col">
          <div><span>Người dùng</span><strong>${escapeHtml(state.user?.displayName || state.user?.username)}</strong></div>
          <div><span>Role</span><strong>${escapeHtml(state.user?.role || 'owner')}</strong></div>
        </div>
        <div class="form-grid two">
          <label>Mật khẩu mới<input type="password" placeholder="Chưa kết nối API đổi mật khẩu"></label>
          <label>Xác nhận mật khẩu<input type="password" placeholder="Nhập lại mật khẩu"></label>
        </div>
      </section>
    </div>
  `;
}

function DeviceStatusCard({ title, iconName, stateText, tone, description, action, page }) {
  return h`
    <article class="device-card ${tone}">
      <div class="device-icon">${icon(iconName, 22)}</div>
      <div>
        <span>${title}</span>
        <strong>${stateText}</strong>
        <p>${description}</p>
      </div>
      <button data-nav="${page}" class="text-link">${action}</button>
    </article>
  `;
}

function SensorMetricCard(title, value, detail, iconName, tone) {
  return h`
    <article class="metric-card ${tone}">
      <div class="metric-icon">${icon(iconName, 21)}</div>
      <span>${title}</span>
      <strong>${value}</strong>
      <p>${detail}</p>
    </article>
  `;
}

function ControlPanelCard(title, iconName, body) {
  return h`
    <section class="card control-card">
      <div class="section-head">
        <div class="control-title">${icon(iconName, 22)}<h3>${title}</h3></div>
        ${state.esp32.status !== 'online' ? '<span class="pill danger">Offline</span>' : '<span class="pill success">Sẵn sàng</span>'}
      </div>
      ${body}
    </section>
  `;
}

function ModeSwitch(name, current, options) {
  const activeIndex = Math.max(0, options.findIndex(([value]) => value === current));
  const locked = state.esp32.status !== 'online' || Date.now() < state.commandLockedUntil;
  return h`
    <div class="mode-switch ${name} index-${activeIndex}" role="group" aria-label="${name} mode">
      <span class="mode-switch-thumb"></span>
      ${options.map(([value, label, action]) => `
        <button data-command-action="${action}" class="${value === current ? 'is-active' : ''}" ${locked ? 'disabled' : ''}>${label}</button>
      `).join('')}
    </div>
  `;
}

function ActionButton(label, action, iconName, dangerConfirm) {
  const offline = state.esp32.status !== 'online';
  const locked = Date.now() < state.commandLockedUntil;
  const pending = state.pendingCommand === action;
  const className = dangerConfirm ? 'btn btn-danger-soft' : action.includes('open') ? 'btn btn-primary' : 'btn btn-secondary';
  return `<button class="${className}" data-command-action="${action}" ${offline || locked || pending ? 'disabled' : ''} title="${offline ? 'ESP32 offline, không thể gửi lệnh' : ''}">${pending ? '<span class="spinner"></span>' : icon(iconName, 18)}${label}</button>`;
}

function ModalDialog(dialog) {
  if (dialog.kind === 'card-form') return CardFormDialog(dialog);
  if (dialog.kind === 'password-form') return PasswordFormDialog(dialog);
  return ConfirmDialog(dialog);
}

function ConfirmDialog(dialog) {
  return h`
    <div class="modal-layer">
      <section class="confirm-dialog">
        <div class="modal-icon">${icon(dialog.icon || 'shield', 24)}</div>
        <h3>${escapeHtml(dialog.title)}</h3>
        <p>${escapeHtml(dialog.message)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-action="close-dialog">Hủy</button>
          <button class="btn btn-danger-soft" ${dialog.confirmAction ? `data-confirm-access="${dialog.confirmAction}" data-confirm-id="${escapeHtml(dialog.id || '')}"` : `data-confirm-command="${dialog.action}"`}>${icon('check', 18)}Xác nhận</button>
        </div>
      </section>
    </div>
  `;
}

function CardFormDialog(dialog) {
  const card = dialog.card || {};
  const isEdit = !!card.id;
  return h`
    <div class="modal-layer">
      <section class="form-dialog">
        <div class="modal-head">
          <div class="modal-icon">${icon('shield', 22)}</div>
          <div><p class="eyebrow">RFID</p><h3>${isEdit ? 'Cập nhật thẻ' : dialog.enroll ? 'Add Card Mode' : 'Thêm thẻ thủ công'}</h3></div>
          <button class="icon-btn" data-action="close-dialog" title="Đóng">${icon('x', 16)}</button>
        </div>
        <form id="card-form" class="form-stack">
          ${dialog.enroll ? '<p class="hint">Sau khi lưu, quẹt thẻ mới trước đầu đọc trong 60 giây.</p>' : h`
            <label>UID thẻ
              <input name="uid" value="${escapeHtml(card.uid || '')}" placeholder="23 4E F6 2F" ${isEdit ? 'disabled' : 'required'}>
            </label>
          `}
          <label>Tên thẻ
            <input name="name" value="${escapeHtml(card.name || 'Thẻ mới')}" required>
          </label>
          <label>Mở khóa
            <select name="target">
              ${option('mainDoor', 'Cửa chính', card.target || 'mainDoor')}
              ${option('garageDoor', 'Gara', card.target || 'mainDoor')}
            </select>
          </label>
          <label>Trạng thái
            <select name="enabled">
              ${option('true', 'Enabled', String(card.enabled !== false))}
              ${option('false', 'Disabled', String(card.enabled !== false))}
            </select>
          </label>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-action="close-dialog">Hủy</button>
            <button class="btn btn-primary" type="submit">${icon('check', 18)}${dialog.enroll ? 'Bật ghi thẻ' : isEdit ? 'Lưu thẻ' : 'Thêm thẻ'}</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function PasswordFormDialog() {
  return h`
    <div class="modal-layer">
      <section class="form-dialog">
        <div class="modal-head">
          <div class="modal-icon">${icon('lock', 22)}</div>
          <div><p class="eyebrow">Keypad</p><h3>Tạo mật khẩu truy cập</h3></div>
          <button class="icon-btn" data-action="close-dialog" title="Đóng">${icon('x', 16)}</button>
        </div>
        <form id="password-form" class="form-stack">
          <label>Mật khẩu/PIN mới
            <input name="password" type="password" minlength="4" maxlength="16" autocomplete="new-password" required>
          </label>
          <label>Tên mật khẩu
            <input name="name" value="Mật khẩu tạm" required>
          </label>
          <label>Hiệu lực
            <select name="durationMode">
              <option value="full_time">Dùng toàn thời gian</option>
              <option value="minutes">Giới hạn theo phút</option>
            </select>
          </label>
          <label>Số phút hiệu lực
            <input name="relativeMinutes" type="number" min="1" max="1440" placeholder="Bỏ trống nếu toàn thời gian">
          </label>
          <p class="hint">Mật khẩu được lưu dạng hash trong Firestore, dashboard không hiển thị lại plain text.</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-action="close-dialog">Hủy</button>
            <button class="btn btn-primary" type="submit">${icon('check', 18)}Tạo mật khẩu</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function AccessPolicyView(item) {
  if (item.expiresAtIso) return `<div class="access-policy warning">${icon('lock', 14)}Hết hạn ${timeLabel(item.expiresAtIso)}</div>`;
  if (item.accessType === 'time_window' && item.timeWindow) {
    return `<div class="access-policy info">${icon('activity', 14)}${escapeHtml(item.timeWindow.start || '--:--')} - ${escapeHtml(item.timeWindow.end || '--:--')}</div>`;
  }
  if (item.accessType === 'date_range' && item.dateRange) {
    return `<div class="access-policy info">${icon('chart', 14)}${shortDateLabel(item.dateRange.startIso)} - ${shortDateLabel(item.dateRange.endIso)}</div>`;
  }
  return `<div class="access-policy success">${icon('check', 14)}Toàn thời gian</div>`;
}

function EventTimeline(events, compact = false) {
  if (!events.length) return '<div class="empty-state">Chưa có dữ liệu sự kiện.</div>';
  return `<div class="${compact ? 'timeline compact' : 'timeline'}">${events.map(event => h`
    <article class="timeline-item ${eventTone(event.type)}">
      <span class="timeline-dot">${icon(eventIcon(event.type), 15)}</span>
      <div>
        <div class="timeline-top"><strong>${eventTypeLabel(event.type)}</strong><time>${escapeHtml(event.time)}</time></div>
        <p>${escapeHtml(event.message)}</p>
        <span class="muted">${escapeHtml(event.source)} · ${escapeHtml(event.target || 'system')}</span>
      </div>
    </article>
  `).join('')}</div>`;
}

function StatCard(title, value, detail, iconName) {
  return h`<article class="stat-card"><div class="stat-icon">${icon(iconName, 20)}</div><span>${title}</span><strong>${value}</strong><p>${detail}</p></article>`;
}

function ChartCard(title, unit, series, iconName, bars = false) {
  return h`
    <section class="card chart-card">
      <div class="section-head"><div class="control-title">${icon(iconName, 21)}<h3>${title}</h3></div><span class="pill">${unit}</span></div>
      ${series?.length ? MiniChart(series, bars, unit) : '<div class="empty-state">Chưa có dữ liệu.</div>'}
    </section>
  `;
}

function MiniChart(series, bars, unit) {
  const values = series.map(point => point.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  if (bars) {
    return `<div class="chart-frame"><div class="bar-chart">${series.map(point => `<span style="height:${Math.max(10, (point.value / max) * 100)}%" title="${point.label}: ${point.value}${unit}"></span>`).join('')}</div>${ChartAxis(series, unit)}</div>`;
  }
  const points = series.map((point, i) => {
    const x = (i / (series.length - 1 || 1)) * 100;
    const y = 90 - ((point.value - min) / (max - min || 1)) * 75;
    return `${x},${y}`;
  }).join(' ');
  return `<div class="chart-frame"><svg class="line-chart" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${points}"/></svg><div class="chart-points">${series.map((point, i) => {
    const x = (i / (series.length - 1 || 1)) * 100;
    const y = 90 - ((point.value - min) / (max - min || 1)) * 75;
    return `<span style="left:${x}%;top:${y}%" title="${point.label}: ${point.value}${unit}"></span>`;
  }).join('')}</div>${ChartAxis(series, unit)}</div>`;
}

function ChartAxis(series, unit) {
  const first = series[0];
  const mid = series[Math.floor(series.length / 2)];
  const last = series[series.length - 1];
  return h`
    <div class="chart-axis">
      <span><strong>${first.value}${unit}</strong>${first.label}</span>
      <span><strong>${mid.value}${unit}</strong>${mid.label}</span>
      <span><strong>${last.value}${unit}</strong>${last.label}</span>
    </div>
  `;
}

function SettingsCard(title, rows) {
  return h`
    <section class="card">
      <div class="section-head"><div><p class="eyebrow">Settings</p><h3>${title}</h3></div></div>
      <div class="settings-list">${rows.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>
    </section>
  `;
}

function NumberInput(key, label, unit) {
  return `<label>${label}<div class="input-suffix"><input data-form="${key}" type="number" value="${state.forms[key]}"><span>${unit}</span></div></label>`;
}

function option(value, label, selected) {
  return `<option value="${value}" ${String(value) === String(selected) ? 'selected' : ''}>${label}</option>`;
}

function bindEvents() {
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => setState({ activePage: el.dataset.nav, sidebarOpen: false }));
  });
  document.querySelectorAll('[data-action="logout"]').forEach(el => el.addEventListener('click', logout));
  document.querySelectorAll('[data-action="open-sidebar"]').forEach(el => el.addEventListener('click', () => setState({ sidebarOpen: true })));
  document.querySelectorAll('[data-action="close-sidebar"], .scrim').forEach(el => el.addEventListener('click', () => setState({ sidebarOpen: false })));
  document.querySelectorAll('[data-action="close-dialog"]').forEach(el => el.addEventListener('click', () => setState({ dialog: null })));
  document.querySelectorAll('[data-action="refresh"]').forEach(el => el.addEventListener('click', refreshAll));
  document.querySelectorAll('[data-filter]').forEach(el => el.addEventListener('click', () => setNestedForm('timeFilter', el.dataset.filter)));
  document.querySelectorAll('[data-form]').forEach(el => {
    el.addEventListener('input', () => setNestedForm(el.dataset.form, el.value, true));
    el.addEventListener('change', () => setNestedForm(el.dataset.form, el.value));
  });
  document.querySelectorAll('[data-command-action]').forEach(el => {
    el.addEventListener('click', () => handleCommandAction(el.dataset.commandAction));
  });
  document.querySelectorAll('[data-confirm-command]').forEach(el => {
    el.addEventListener('click', () => {
      const action = el.dataset.confirmCommand;
      setState({ dialog: null }, false);
      executeCommand(action);
    });
  });
  document.querySelectorAll('[data-confirm-access]').forEach(el => {
    el.addEventListener('click', () => {
      const action = el.dataset.confirmAccess;
      const id = el.dataset.confirmId;
      setState({ dialog: null }, false);
      if (action === 'delete-card') deleteAccessCard(id, true);
      if (action === 'delete-password') deletePassword(id, true);
    });
  });
  const cardForm = document.getElementById('card-form');
  if (cardForm) cardForm.addEventListener('submit', submitCardForm);
  const passwordForm = document.getElementById('password-form');
  if (passwordForm) passwordForm.addEventListener('submit', submitPasswordForm);
  document.querySelectorAll('[data-card-delete]').forEach(el => {
    el.addEventListener('click', () => deleteAccessCard(el.dataset.cardDelete));
  });
  document.querySelectorAll('[data-card-edit]').forEach(el => {
    el.addEventListener('click', () => renameAccessCard(el.dataset.cardEdit));
  });
  document.querySelectorAll('[data-password-delete]').forEach(el => {
    el.addEventListener('click', () => deletePassword(el.dataset.passwordDelete));
  });
  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);
}

function setNestedForm(key, value, skipRender = false) {
  const numeric = ['doorAutoClose', 'lightBrightness', 'lightHold', 'fanDir', 'fanSpeed', 'temperatureOnThreshold', 'temperatureOffThreshold', 'humidityOnThreshold', 'humidityOffThreshold'];
  state.forms = { ...state.forms, [key]: numeric.includes(key) ? Number(value) : value };
  state.lastFormEditAt = Date.now();
  if (!skipRender) render();
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  setState({ login: { loading: true, error: '' } });
  try {
    const body = await request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    localStorage.setItem(storage.token, body.token);
    localStorage.setItem(storage.user, JSON.stringify(body.user));
    state.token = body.token;
    state.user = body.user;
    state.login = { loading: false, error: '' };
    startRealtime();
    showToast('Đăng nhập thành công.', 'success');
    render();
  } catch {
    setState({ login: { loading: false, error: 'ID hoặc mật khẩu không đúng.' } });
  }
}

function logout() {
  if (state.eventSource) state.eventSource.close();
  localStorage.removeItem(storage.token);
  localStorage.removeItem(storage.user);
  setState({ token: '', user: null, eventSource: null, activePage: 'overview' });
}

function startRealtime() {
  connectMonitor();
  refreshAll();
}

async function refreshAll() {
  await Promise.allSettled([refreshSensor(), refreshStats(), refreshEvents(), refreshAccess(), refreshDailyStats()]);
}

async function refreshSensor() {
  try {
    const data = await request('/sensor');
    const adapted = stabilizeLightSensor(stabilizeFanSensor(adaptSensor(data)));
    state.sensor = adapted;
    pushSensorHistory(adapted);
    syncFormsFromSensor(adapted);
    state.esp32 = { status: 'online', lastSeen: data.time || new Date().toLocaleTimeString('vi-VN') };
    render();
  } catch {
    state.esp32 = { ...state.esp32, status: 'offline' };
    render();
  }
}

async function refreshStats() {
  try {
    const stats = await request('/stats');
    state.stats = { ...state.stats, ...stats };
    if (stats.esp32Connected) state.esp32 = { ...state.esp32, status: 'online', lastSeen: stats.lastStatusAt || state.esp32.lastSeen };
    render();
  } catch {}
}

async function refreshEvents() {
  try {
    const events = await request('/events?limit=120');
    state.events = events.map(adaptEventFromFirestore);
  } catch {}
}

async function refreshDailyStats() {
  try {
    const rows = await request('/daily-stats?days=7');
    state.dailyStats = rows.map(adaptDailyStat);
  } catch {}
}

async function refreshAccess() {
  try {
    const [cards, passwords] = await Promise.all([
      request('/access/cards'),
      request('/access/passwords'),
    ]);
    state.accessCards = cards.map(adaptAccessCard);
    state.passwords = passwords.map(adaptPassword);
  } catch {}
}

function connectMonitor() {
  if (state.eventSource) state.eventSource.close();
  const source = new EventSource(`${API}/log-stream?token=${encodeURIComponent(state.token)}`);
  state.eventSource = source;
  source.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.level === 'STATUS') {
        state.sensor = stabilizeLightSensor(stabilizeFanSensor(adaptSensor(JSON.parse(msg.message), msg.time)));
        pushSensorHistory(state.sensor);
        syncFormsFromSensor(state.sensor);
        state.esp32 = { status: 'online', lastSeen: msg.time };
        render();
        return;
      }
      addEventFromServer(msg);
      render();
    } catch {}
  };
  source.onerror = () => {
    state.esp32 = { ...state.esp32, status: 'reconnecting' };
    addEvent({ type: 'esp32_disconnected', source: 'system', target: 'esp32', message: 'Mất kết nối monitor, đang thử lại...', time: nowTime() });
    render();
  };
}

function handleCommandAction(action) {
  if (action === 'create-password') {
    createPasswordFlow();
    return;
  }
  if (action === 'create-card-manual') {
    createCardFlow();
    return;
  }
  if (action === 'add-card-mode') {
    enrollCardFlow();
    return;
  }
  executeCommand(action);
}

async function executeCommand(action) {
  if (state.esp32.status !== 'online') {
    showToast('ESP32 offline, không thể gửi lệnh trực tiếp.', 'error');
    return;
  }
  if (Date.now() < state.commandLockedUntil) {
    showToast('Đang chờ khoảng nghỉ giữa hai lệnh.', 'warning');
    return;
  }

  state.pendingCommand = action;
  state.commandLockedUntil = Date.now() + COMMAND_INTERVAL_MS;
  state.commandUnlockRenderAt = state.commandLockedUntil;
  applyOptimisticCommand(action);
  render();

  const command = commandPayload(action);
  if (!command) {
    showToast('Chức năng này cần API backend bổ sung.', 'warning');
    state.pendingCommand = null;
    render();
    return;
  }

  try {
    const result = await request(command.path, { method: 'POST', body: JSON.stringify(command.body || {}) });
    showToast(`Command thành công: ${command.label}`, 'success');
    addEvent({ type: 'remote_command', source: 'web_app', target: command.target, message: `${command.label} (${typeof result === 'string' ? result : 'OK'})`, time: nowTime() });
    setTimeout(refreshAll, 350);
  } catch (e) {
    showToast(`Command thất bại: ${e.message}`, 'error');
    addEvent({ type: 'access_failed', source: 'web_app', target: command.target, message: `${command.label} thất bại: ${e.message}`, time: nowTime() });
    setTimeout(refreshAll, 350);
  } finally {
    state.pendingCommand = null;
    render();
  }
}

async function createCardFlow() {
  setState({ dialog: { kind: 'card-form' } });
}

async function submitCardForm(e) {
  e.preventDefault();
  const form = new FormData(e.currentTarget);
  const dialog = state.dialog || {};
  const name = String(form.get('name') || '').trim() || 'Thẻ mới';
  const target = form.get('target') === 'garageDoor' ? 'garageDoor' : 'mainDoor';
  const enabled = form.get('enabled') !== 'false';
  try {
    if (dialog.enroll) {
      await request('/access/cards/enroll', { method: 'POST', body: JSON.stringify({ name, target }) });
      showToast('Add Card Mode bật trong 60 giây. Quẹt thẻ trước đầu đọc RFID.', 'success');
    } else if (dialog.card?.id) {
      await request(`/access/cards/${encodeURIComponent(dialog.card.id)}`, { method: 'PATCH', body: JSON.stringify({ name, target, enabled }) });
      showToast('Đã cập nhật thẻ.', 'success');
    } else {
      const uid = String(form.get('uid') || '').trim();
      await request('/access/cards', {
        method: 'POST',
        body: JSON.stringify({ uid, name, target, accessType: 'full_time', enabled }),
      });
      showToast('Đã thêm thẻ RFID.', 'success');
    }
    state.dialog = null;
    await refreshAccess();
    render();
  } catch (e) {
    showToast(`Không lưu được thẻ: ${e.message}`, 'error');
  }
}

async function enrollCardFlow() {
  setState({ dialog: { kind: 'card-form', enroll: true } });
}

async function renameAccessCard(id) {
  const card = state.accessCards.find(item => item.id === id);
  setState({ dialog: { kind: 'card-form', card } });
}

async function deleteAccessCard(id, confirmed = false) {
  if (!confirmed) {
    setState({ dialog: { title: 'Xóa thẻ RFID?', message: 'Thẻ này sẽ không còn được phép mở cửa khi ESP32 xác thực qua server.', icon: 'trash', confirmAction: 'delete-card', id } });
    return;
  }
  try {
    await request(`/access/cards/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast('Đã xóa thẻ.', 'success');
    await refreshAccess();
    render();
  } catch (e) {
    showToast(`Không xóa được thẻ: ${e.message}`, 'error');
  }
}

async function createPasswordFlow() {
  setState({ dialog: { kind: 'password-form' } });
}

async function submitPasswordForm(e) {
  e.preventDefault();
  const form = new FormData(e.currentTarget);
  const password = String(form.get('password') || '');
  const name = String(form.get('name') || '').trim() || 'Mật khẩu tạm';
  const relativeMinutesRaw = String(form.get('relativeMinutes') || '').trim();
  const useMinutes = form.get('durationMode') === 'minutes' && relativeMinutesRaw;
  const body = {
    password,
    name,
    type: useMinutes ? 'guest' : 'temporary',
    accessType: 'full_time',
    relativeMinutes: useMinutes ? Number(relativeMinutesRaw) : undefined,
  };
  try {
    await request('/access/passwords', { method: 'POST', body: JSON.stringify(body) });
    showToast('Đã tạo mật khẩu truy cập.', 'success');
    state.dialog = null;
    await refreshAccess();
    render();
  } catch (e) {
    showToast(`Không tạo được mật khẩu: ${e.message}`, 'error');
  }
}

async function deletePassword(id, confirmed = false) {
  if (!confirmed) {
    setState({ dialog: { title: 'Xóa mật khẩu?', message: 'Mật khẩu này sẽ bị gỡ khỏi Firestore và không còn hợp lệ khi xác thực online.', icon: 'trash', confirmAction: 'delete-password', id } });
    return;
  }
  try {
    await request(`/access/passwords/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast('Đã xóa mật khẩu.', 'success');
    await refreshAccess();
    render();
  } catch (e) {
    showToast(`Không xóa được mật khẩu: ${e.message}`, 'error');
  }
}

function applyOptimisticCommand(action) {
  const next = { ...state.sensor };
  if (action === 'garage-auto') next.garageMode = 'AUTO';
  if (action === 'garage-manual' || action === 'garage-open' || action === 'garage-close') next.garageMode = 'MANUAL';
  if (action === 'light-auto') next.lightMode = 'AUTO';
  if (action === 'light-manual' || action === 'light-on' || action === 'light-off') next.lightMode = 'MANUAL';
  if (action === 'light-on') next.lightOn = true;
  if (action === 'light-off') next.lightOn = false;
  if (action === 'light-settings') {
    state.desiredLight = {
      brightness: Number(state.forms.lightBrightness),
      effect: state.forms.lightEffect,
      hold: Number(state.forms.lightHold),
      until: Date.now() + 15000,
    };
    next.lightBrightness = Number(state.forms.lightBrightness);
    next.lightEffect = state.forms.lightEffect;
    next.lightHold = Number(state.forms.lightHold);
  }
  if (action === 'fan-apply') {
    state.desiredFan = {
      mode: state.forms.fanMode,
      dir: Number(state.forms.fanDir),
      speed: Number(state.forms.fanSpeed),
      until: Date.now() + 15000,
    };
    next.fanMode = state.forms.fanMode === 'auto' ? 'AUTO' : 'MANUAL';
    next.fanPct = state.forms.fanMode === 'off' ? 0 : Number(state.forms.fanSpeed);
    next.fan = state.forms.fanMode === 'off' || Number(state.forms.fanSpeed) === 0
      ? 'OFF'
      : Number(state.forms.fanDir) === -1 ? 'REVERSE' : 'FORWARD';
  }
  state.sensor = next;
}

function commandPayload(action) {
  const seconds = String(state.forms.doorAutoClose || 30);
  const map = {
    'door-open': { path: '/command', body: { method: 'POST', path: '/unlock', payload: seconds }, label: 'Mở cửa chính', target: 'mainDoor' },
    'door-close': { path: '/command', body: { method: 'POST', path: '/close' }, label: 'Đóng cửa chính', target: 'mainDoor' },
    'unlock-lockout': { path: '/command', body: { method: 'POST', path: '/unlock', payload: seconds }, label: 'Giải khóa truy cập', target: 'mainDoor' },
    'garage-open': { path: '/gara', body: { action: 'open' }, label: 'Mở gara', target: 'garageDoor' },
    'garage-close': { path: '/gara', body: { action: 'close' }, label: 'Đóng gara', target: 'garageDoor' },
    'light-on': { path: '/light', body: { state: 'on' }, label: 'Bật đèn hành lang', target: 'hallwayLight' },
    'light-off': { path: '/light', body: { state: 'off' }, label: 'Tắt đèn hành lang', target: 'hallwayLight' },
    'light-auto': { path: '/light', body: { state: 'auto' }, label: 'Đèn chế độ tự động', target: 'hallwayLight' },
    'light-manual': { path: '/light', body: { state: state.sensor.lightOn ? 'on' : 'off' }, label: 'Đèn chế độ thủ công', target: 'hallwayLight' },
    'light-settings': { path: '/light/settings', body: { holdSeconds: state.forms.lightHold, brightness: state.forms.lightBrightness, effect: state.forms.lightEffect }, label: 'Lưu cấu hình đèn', target: 'hallwayLight' },
    'garage-auto': { path: '/command', body: { method: 'POST', path: '/gara_auto' }, label: 'Gara chế độ tự động', target: 'garageDoor' },
    'garage-manual': { path: '/command', body: { method: 'POST', path: '/gara_manual' }, label: 'Gara chế độ thủ công', target: 'garageDoor' },
    'fan-apply': { path: '/fan', body: { mode: state.forms.fanMode, dir: Number(state.forms.fanDir), speed: Number(state.forms.fanSpeed) }, label: 'Áp dụng quạt', target: 'environmentFan' },
    'fan-settings': { path: '/fan/settings', body: { temperatureOnThreshold: state.forms.temperatureOnThreshold, temperatureOffThreshold: state.forms.temperatureOffThreshold, humidityOnThreshold: state.forms.humidityOnThreshold, humidityOffThreshold: state.forms.humidityOffThreshold }, label: 'Lưu ngưỡng quạt', target: 'environmentFan' },
    'sync': { path: '/command', body: { method: 'POST', path: '/status' }, label: 'Sync config', target: 'esp32' },
    'add-card-mode': { path: '/command', body: { method: 'POST', path: '/rfid_add_mode' }, label: 'Bật Add Card Mode', target: 'rfid' },
  };
  return map[action];
}

function renderCommandButtonsOnly() {
  if (!state.token || !state.commandLockedUntil) return;
  if (Date.now() < state.commandLockedUntil) return;
  state.commandLockedUntil = 0;
  if (state.commandUnlockRenderAt) {
    state.commandUnlockRenderAt = 0;
    render();
  }
}

function adaptSensor(data, time) {
  const lightOn = data.light === true || data.light === 'true' || data.light === 'ON';
  return {
    door: String(data.door || 'UNKNOWN').toUpperCase(),
    gara: String(data.gara || data.garage || 'UNKNOWN').toUpperCase(),
    garageMode: String(data.garageMode || 'AUTO').toUpperCase(),
    temp: data.temp ?? data.temperature ?? null,
    humidity: data.humidity ?? null,
    motion: data.motion === true || data.motion === 'true' || data.motion === 'ON',
    dist: data.dist ?? data.distanceCm ?? null,
    fan: String(data.fan || 'OFF').toUpperCase(),
    fanPct: data.fanPct ?? data.fanSpeed ?? 0,
    fanMode: String(data.fanMode || 'MANUAL').toUpperCase(),
    lightOn,
    lightMode: String(data.lightMode || 'MANUAL').toUpperCase(),
    lightBrightness: Number(data.lightBrightness ?? data.brightness ?? (state?.forms?.lightBrightness ?? 70)),
    lightEffect: data.lightEffect || data.effect || (state?.forms?.lightEffect ?? 'Static'),
    lightHold: Number(data.lightHold ?? data.holdSeconds ?? (state?.forms?.lightHold ?? 15)),
    time: data.time || time || nowTime(),
    labelTime: timeLabel(data.time || time),
    receivedAt: Date.now(),
  };
}

function stabilizeFanSensor(sensor) {
  const desired = state.desiredFan;
  if (!desired) return sensor;
  if (Date.now() > desired.until) {
    state.desiredFan = null;
    return sensor;
  }
  return {
    ...sensor,
    fanMode: desired.mode === 'auto' ? 'AUTO' : 'MANUAL',
    fanPct: desired.mode === 'off' ? 0 : desired.speed,
    fan: desired.mode === 'off' || desired.speed === 0
      ? 'OFF'
      : desired.dir === -1 ? 'REVERSE' : 'FORWARD',
  };
}

function stabilizeLightSensor(sensor) {
  const desired = state.desiredLight;
  if (!desired) return sensor;
  if (Date.now() > desired.until) {
    state.desiredLight = null;
    return sensor;
  }
  return {
    ...sensor,
    lightBrightness: desired.brightness,
    lightEffect: desired.effect,
    lightHold: desired.hold,
  };
}

function addEventFromServer(msg) {
  const mapped = {
    ERROR: 'access_failed',
    WARN: 'access_failed',
    LOCKOUT: 'access_lockout',
    INFO: 'device_state_changed',
  };
  addEvent({
    type: mapped[msg.level] || 'device_state_changed',
    source: 'system',
    target: inferTarget(msg.message),
    message: msg.message,
    time: msg.time || nowTime(),
  });
}

function adaptEventFromFirestore(doc) {
  const created = doc.createdAtIso || doc.updatedAtIso || doc.time || doc.createdAt?.toDate?.();
  return {
    id: doc.id || cryptoId(),
    type: doc.type || 'device_state_changed',
    source: doc.source || 'system',
    target: doc.target || doc.deviceId || 'system',
    message: doc.message || `${doc.type || 'event'}`,
    time: timeLabel(created),
  };
}

function adaptAccessCard(card) {
  return {
    id: card.id,
    name: card.name || `Thẻ ${card.uid || ''}`,
    uid: card.uid || '',
    target: card.target || 'mainDoor',
    accessType: card.accessType || 'full_time',
    timeWindow: card.timeWindow || null,
    dateRange: card.dateRange || null,
    expiresAtIso: card.expiresAtIso || null,
    enabled: card.enabled !== false,
    updatedAt: timeLabel(card.updatedAtIso || card.createdAtIso),
  };
}

function adaptPassword(password) {
  return {
    id: password.id,
    name: password.name || 'Mật khẩu',
    type: password.type || 'temporary',
    target: password.target || 'mainDoor',
    accessType: password.accessType || 'full_time',
    timeWindow: password.timeWindow || null,
    dateRange: password.dateRange || null,
    expiresAtIso: password.expiresAtIso || null,
    status: password.status || 'active',
  };
}

function adaptDailyStat(row) {
  return {
    id: row.id || row.date,
    date: row.date || row.id,
    label: shortDateLabel(row.date || row.id),
    avgTemperature: Number(row.avgTemperature ?? row.avgTemp ?? row.lastTemperature ?? 0),
    avgHumidity: Number(row.avgHumidity ?? row.lastHumidity ?? 0),
    fanOnMinutes: Number(row.fanOnMinutes ?? row.fanMinutes ?? 0),
    lightOnMinutes: Number(row.lightOnMinutes ?? row.lightMinutes ?? 0),
    unlocks: Number(row.unlocks ?? 0),
    garageEvents: Number(row.garageEvents ?? 0),
    lockouts: Number(row.lockouts ?? 0),
    failedAccess: Number(row.failedAccess ?? 0),
    hourly: row.hourly || null,
  };
}

function shortDateLabel(value) {
  const text = String(value || '');
  const date = new Date(text.includes('T') ? text : `${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value || '---';
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function addEvent(event) {
  state.events = [{ id: cryptoId(), ...event }, ...state.events].slice(0, 120);
}

function showToast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<strong>${type === 'success' ? 'Thành công' : type === 'error' ? 'Lỗi' : 'Thông báo'}</strong><span>${escapeHtml(message)}</span>`;
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

function mockSensor() {
  return adaptSensor({ door: 'CLOSED', gara: 'CLOSED', temp: 27, humidity: 44, motion: true, dist: 17, fan: 'OFF', fanPct: 0, fanMode: 'MANUAL', light: true, lightMode: 'MANUAL', time: 'Mock fallback' });
}

function pushSensorHistory(sensor) {
  const last = state.sensorHistory[state.sensorHistory.length - 1];
  if (last && Date.now() - last.receivedAt < 1500) return;
  state.sensorHistory = [...state.sensorHistory, {
    temp: Number(sensor.temp ?? 0),
    humidity: Number(sensor.humidity ?? 0),
    label: sensor.labelTime || nowTime(),
    receivedAt: sensor.receivedAt || Date.now(),
  }].slice(-24);
}

function syncFormsFromSensor(sensor) {
  const active = document.activeElement;
  if (active && active.dataset && active.dataset.form) return;
  if (state.pendingCommand) return;
  if (Date.now() - state.lastFormEditAt < 8000) return;
    state.forms = {
      ...state.forms,
      lightBrightness: Number(sensor.lightBrightness ?? state.forms.lightBrightness),
      lightEffect: sensor.lightEffect || state.forms.lightEffect,
      lightHold: Number(sensor.lightHold ?? state.forms.lightHold),
      fanMode: sensor.fanMode === 'AUTO' ? 'auto' : sensor.fan === 'OFF' ? 'off' : 'manual',
      fanSpeed: Number(sensor.fanPct ?? state.forms.fanSpeed),
      fanDir: sensor.fan === 'REVERSE' ? -1 : sensor.fan === 'OFF' ? 0 : 1,
  };
}

function mockStats() {
  return { statusUpdates: 11, events: 2, commands: 0, alerts: 0, unlocks: 0, failedCommands: 0, lockouts: 0, garageEvents: 0 };
}

function mockEvents() {
  return [
    { id: 'e1', type: 'esp32_connected', source: 'system', target: 'esp32', message: 'ESP32 sẵn sàng nhận lệnh WebSocket', time: '22:17:49' },
    { id: 'e2', type: 'sensor_reading', source: 'esp32', target: 'environment', message: 'Cập nhật DHT11 và cảm biến gara', time: '22:17:44' },
    { id: 'e3', type: 'device_state_changed', source: 'system', target: 'hallwayLight', message: 'Đèn hành lang đang bật ở chế độ thủ công', time: '22:16:58' },
  ];
}

function mockAccessCards() {
  return [
    { name: 'Thẻ chủ nhà', uid: 'A4:19:2C:8F', target: 'mainDoor', accessType: 'full_time', enabled: true, updatedAt: '2026-05-20' },
    { name: 'Thẻ gara', uid: '7B:02:AA:10', target: 'garageDoor', accessType: 'time_window', enabled: true, updatedAt: '2026-05-19' },
    { name: 'Thẻ khách cũ', uid: '90:11:FE:22', target: 'mainDoor', accessType: 'date_range', enabled: false, updatedAt: '2026-05-10' },
  ];
}

function mockPasswords() {
  return [
    { name: 'Mật khẩu master', type: 'master', target: 'mainDoor', status: 'active' },
    { name: 'Khách cuối tuần', type: 'temporary', target: 'mainDoor', status: 'active' },
    { name: 'Mã giao hàng', type: 'guest', target: 'garageDoor', status: 'expired' },
  ];
}

function displayState(kind, value) {
  const v = String(value || 'UNKNOWN').toUpperCase();
  const map = {
    OPEN: 'Đang mở',
    CLOSED: 'Đã đóng',
    LOCKED_OUT: 'Đang khóa',
    LOCKED: 'Đã khóa',
    ON: 'Bật',
    OFF: 'Tắt',
    UNKNOWN: 'Chưa rõ',
  };
  return map[v] || (kind === 'fan' && v !== 'OFF' ? 'Bật' : v);
}

function displayMode(value) {
  const v = String(value || 'UNKNOWN').toUpperCase();
  return ({ AUTO: 'Tự động', MANUAL: 'Thủ công', OFF: 'Tắt', UNKNOWN: 'Chưa rõ' })[v] || v;
}

function effectLabel(value) {
  const v = String(value || 'static').toLowerCase();
  return ({ static: 'Sáng ổn định', blink: 'Nhấp nháy', fading: 'Mờ dần' })[v] || value;
}

function toneForDoor(value) {
  const v = String(value).toUpperCase();
  if (v === 'LOCKED_OUT' || v === 'LOCKED') return 'danger';
  if (v === 'OPEN') return 'warning';
  if (v === 'CLOSED') return 'success';
  return 'neutral';
}

function toneForGarage(value) {
  const v = String(value).toUpperCase();
  if (v === 'OPEN') return 'warning';
  if (v === 'CLOSED') return 'success';
  return 'neutral';
}

function sensorTone(type) {
  if (type === 'temp' && Number(state.sensor.temp) >= state.forms.temperatureOnThreshold) return 'warning';
  if (type === 'humidity' && Number(state.sensor.humidity) >= state.forms.humidityOnThreshold) return 'warning';
  return 'info';
}

function distanceTone() {
  const d = Number(state.sensor.dist);
  return Number.isFinite(d) && d > 0 && d <= 7 ? 'success' : 'neutral';
}

function doorDescription() {
  if (state.sensor.door === 'LOCKED_OUT') return 'Truy cập đang bị khóa tạm thời';
  if (state.sensor.door === 'OPEN') return 'Cửa đang mở, kiểm tra khu vực ra vào';
  return 'Cửa chính an toàn';
}

function garageDistanceText() {
  const d = Number(state.sensor.dist);
  return Number.isFinite(d) && d > 0 && d <= 7 ? 'Trong ngưỡng phát hiện' : 'Ngưỡng phát hiện 7cm';
}

function formatDistance(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `${n}cm` : '--cm';
}

function valueOrDash(value) {
  return value == null ? '--' : value;
}

function homeMoodText() {
  if (state.esp32.status !== 'online') return 'Hệ thống đang chờ ESP32';
  if (state.sensor.door === 'LOCKED_OUT') return 'Có cảnh báo bảo mật';
  if (state.sensor.gara === 'OPEN' || state.sensor.door === 'OPEN') return 'Có lối vào đang mở';
  return 'Ngôi nhà đang ổn định';
}

function garageOpenTooLong() {
  return state.sensor.gara === 'OPEN' && state.sensor.receivedAt && Date.now() - state.sensor.receivedAt > GARAGE_OPEN_WARN_MS;
}

function eventTone(type) {
  if (['access_failed', 'access_lockout', 'esp32_disconnected'].includes(type)) return 'danger';
  if (type === 'sensor_reading') return 'info';
  if (type === 'remote_command') return 'accent';
  return 'success';
}

function eventIcon(type) {
  if (type.includes('access')) return 'shield';
  if (type.includes('sensor')) return 'activity';
  if (type.includes('command')) return 'sync';
  if (type.includes('esp32')) return 'wifi';
  return 'check';
}

function eventTypeLabel(type) {
  return ({
    access_success: 'Truy cập hợp lệ',
    access_failed: 'Truy cập lỗi',
    access_lockout: 'Lockout',
    device_state_changed: 'Đổi trạng thái',
    sensor_reading: 'Sensor',
    remote_command: 'Lệnh từ web',
    esp32_connected: 'ESP32 online',
    esp32_disconnected: 'ESP32 offline',
  })[type] || type;
}

function targetLabel(target) {
  return ({ mainDoor: 'Cửa chính', garageDoor: 'Gara', hallwayLight: 'Đèn hành lang', environmentFan: 'Quạt môi trường' })[target] || target;
}

function accessTypeLabel(type) {
  return ({ full_time: 'Toàn thời gian', time_window: 'Theo khung giờ', date_range: 'Theo khoảng ngày' })[type] || type;
}

function filterLabel(value) {
  return ({ today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', custom: 'Custom range' })[value];
}

function makeSeries(base, variance) {
  return Array.from({ length: 12 }, (_, i) => Math.round((Number(base) + Math.sin(i / 1.4) * variance + (i % 3 - 1) * variance / 2) * 10) / 10);
}

function chartSeries(key) {
  const history = state.sensorHistory.length >= 2
    ? state.sensorHistory
    : makeSeries(key === 'temp' ? state.sensor.temp || 27 : state.sensor.humidity || 55, key === 'temp' ? 1.8 : 4)
        .map((value, index) => ({ value, label: relativeBucket(index, 12) }));
  return history.map(point => ({
    value: Number(point[key] ?? point.value ?? 0),
    label: point.label || timeLabel(point.receivedAt),
  }));
}

function dailyStatSeries(primaryKey, legacyKey, fallbackSensorKey) {
  if (state.dailyStats.length) {
    return state.dailyStats.map(row => ({
      value: Number(row[primaryKey] ?? row[legacyKey] ?? 0),
      label: row.label || shortDateLabel(row.date),
    }));
  }
  if (fallbackSensorKey) return chartSeries(fallbackSensorKey);
  return timeBuckets([0, 0, 0, 0, 0, 0, 0]);
}

function hourlyStatSeries(key, fallbackSensorKey) {
  const latest = state.dailyStats[state.dailyStats.length - 1];
  if (latest?.hourly) {
    return Object.entries(latest.hourly).map(([hour, bucket]) => ({
      value: Number(bucket[key] ?? 0),
      label: `${hour}:00`,
    }));
  }
  return chartSeries(fallbackSensorKey);
}

function timeBuckets(values) {
  return values.map((value, index) => ({
    value,
    label: `${String(index * 3).padStart(2, '0')}:00`,
  }));
}

function relativeBucket(index, total) {
  const minutesAgo = (total - index - 1) * 2;
  return minutesAgo === 0 ? 'Bây giờ' : `-${minutesAgo}p`;
}

function inferTarget(message = '') {
  const text = String(message).toLowerCase();
  if (text.includes('gara') || text.includes('cong')) return 'garageDoor';
  if (text.includes('den')) return 'hallwayLight';
  if (text.includes('quat')) return 'environmentFan';
  if (text.includes('cua')) return 'mainDoor';
  return 'system';
}

function nowTime() {
  return new Date().toLocaleTimeString('vi-VN');
}

function timeLabel(value) {
  if (!value || value === 'Mock fallback') return nowTime();
  if (value && typeof value === 'object' && Number.isFinite(value._seconds)) {
    return new Date(value._seconds * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  if (typeof value === 'number') return new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return new Date(parsed).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return String(value);
}

function cryptoId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
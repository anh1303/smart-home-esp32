/**
 * =====================================================================
 *  SMART HOME GATEWAY — V4.0 (WebSocket)
 * =====================================================================
 *
 *  THAY ĐỔI CHÍNH:
 *  [V4.0] Toàn bộ giao tiếp ESP32 ↔ Server chuyển sang WebSocket
 *         - Bỏ: giao tiếp UDP cũ, ESP32 giao tiếp bằng WebSocket
 *         - Thêm: ws library, ESP32 kết nối ws://server:PORT/ws/esp32
 *         - Tất cả lệnh: request-response qua WS với correlation ID
 *         - ESP32 tự push status theo thay đổi đáng kể và heartbeat 20s
 *         - SSE level "STATUS" để dashboard nhận sensor realtime
 *
 *  ENDPOINTS:
 *    GET  /sensor         → trả về sensor data cache (push gần nhất)
 *    GET  /esp32-status   → trạng thái kết nối WS của ESP32
 *    POST /command        → relay lệnh qua WebSocket đến ESP32
 *    POST /gara           → điều khiển cổng gara { action: "open"|"close" }
 *    POST /fan            → điều khiển quạt { mode, dir, speed }
 *    POST /light          → điều khiển đèn hành lang { state: "on"|"off"|"auto" }
 *    GET  /log-stream     → SSE cho dashboard
 *
 *  CÀI ĐẶT:
 *    npm install express cors ws
 *    node server.js
 * =====================================================================
 */

//server.js

try {
  require('dotenv').config();
} catch {
  try {
    const envText = require('fs').readFileSync(require('path').join(__dirname, '.env'), 'utf8');
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (key && process.env[key] == null) process.env[key] = value;
    }
  } catch {}
}

const express   = require('express');
const cors      = require('cors');
const WebSocket = require('ws');
const http      = require('http');
const fs        = require('fs');
const path      = require('path');
const os        = require('os');
const bcrypt    = require('bcrypt');
const jwt       = require('jsonwebtoken');
const { admin, db } = require('./config/firebase');

const app    = express();
const server = http.createServer(app);

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'smartHome_dashboard.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'smartHome_dashboard.html'));
});

// ─── HẰNG SỐ ─────────────────────────────────────────────────────────
const LOG_DIR = './logs/permanent';
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ─── LOCAL FILE STORAGE ─────────────────────────────────────────────
// Firebase chỉ lưu dữ liệu quan trọng: tài khoản, RFID/keypad, config thiết bị.
// Log, event, status sample và thống kê ngày được lưu local để tránh hết quota Firestore.
const LOCAL_DATA_DIR = process.env.LOCAL_DATA_DIR || path.join(__dirname, 'logs', 'local');
const LOCAL_EVENTS_DIR = path.join(LOCAL_DATA_DIR, 'events');
const LOCAL_STATUS_DIR = path.join(LOCAL_DATA_DIR, 'status');
const LOCAL_STATS_DIR = path.join(LOCAL_DATA_DIR, 'stats');
for (const dir of [LOCAL_DATA_DIR, LOCAL_EVENTS_DIR, LOCAL_STATUS_DIR, LOCAL_STATS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
const LOCAL_STATUS_SAMPLE_INTERVAL_MS = Math.max(10000, parseInt(process.env.LOCAL_STATUS_SAMPLE_INTERVAL_MS, 10) || 60000);
let lastLocalStatusSampleAt = 0;

function localDateId(date = new Date()) {
  return localDateParts(date).date;
}

function safeJsonWrite(filePath, data) {
  fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8', err => {
    if (err) writeTempLog('WARN', `Local write failed ${filePath}: ${err.message}`);
  });
}

function appendJsonLine(filePath, row) {
  fs.appendFile(filePath, `${JSON.stringify(row)}\n`, 'utf8', err => {
    if (err) writeTempLog('WARN', `Local append failed ${filePath}: ${err.message}`);
  });
}

function readJsonLines(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch (err) {
    writeTempLog('WARN', `Local read failed ${filePath}: ${err.message}`);
    return [];
  }
}

function localEventFile(date = localDateId()) {
  return path.join(LOCAL_EVENTS_DIR, `events-${date}.jsonl`);
}

function localStatusFile(date = localDateId()) {
  return path.join(LOCAL_STATUS_DIR, `status-${date}.jsonl`);
}

function localDailyStatsFile(date = localDateId()) {
  return path.join(LOCAL_STATS_DIR, `daily-stats-${date}.json`);
}

function writeLocalEvent(row = {}) {
  const iso = row.createdAtIso || nowIso();
  const date = /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : localDateId();
  const event = {
    id: row.id || `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: row.type || 'event',
    source: row.source || 'server',
    target: row.target || 'system',
    message: row.message || '',
    createdAtIso: iso,
    time: row.time || getTime(),
    metadata: row.metadata || {},
  };
  const dedupeKey = row.dedupeKey || `${event.type}:${event.target}:${event.source}:${event.message}`;
  const dedupeMs = Number(row.dedupeMs || 3000);
  const now = Date.now();
  const lastAt = recentLocalEventKeys.get(dedupeKey) || 0;
  if (dedupeMs > 0 && now - lastAt < dedupeMs) return null;
  recentLocalEventKeys.set(dedupeKey, now);
  for (const [key, value] of recentLocalEventKeys) {
    if (now - value > 60000) recentLocalEventKeys.delete(key);
  }
  // Giữ event thật mới phát sinh trong RAM trước khi file append hoàn tất.
  // Nhờ vậy /events sẽ thấy ngay event mới và dashboard không bị hiện rồi biến mất
  // khi refresh xảy ra nhanh hơn thao tác ghi file.
  recentLocalEventsBuffer.unshift(event);
  if (recentLocalEventsBuffer.length > RECENT_LOCAL_EVENT_BUFFER_MAX) {
    recentLocalEventsBuffer.length = RECENT_LOCAL_EVENT_BUFFER_MAX;
  }

  appendJsonLine(localEventFile(date), event);
  // Đẩy event local ra dashboard ngay qua SSE để log thật không phải chờ lượt refresh 5s.
  pushLog('EVENT', JSON.stringify(event));
  return event;
}

function writeLocalStatusSample(msg = {}) {
  const now = Date.now();
  if (now - lastLocalStatusSampleAt < LOCAL_STATUS_SAMPLE_INTERVAL_MS) return;
  lastLocalStatusSampleAt = now;
  appendJsonLine(localStatusFile(localDateId()), {
    createdAtIso: nowIso(),
    time: getTime(),
    door: msg.door || null,
    gara: msg.gara || null,
    garageMode: msg.garageMode || null,
    temp: msg.temp ?? null,
    humidity: msg.humidity ?? null,
    motion: msg.motion ?? null,
    fan: msg.fan || null,
    fanPct: msg.fanPct ?? null,
    fanMode: msg.fanMode || null,
    light: msg.light ?? null,
    lightMode: msg.lightMode || null,
    lightBrightness: msg.lightBrightness ?? null,
    lightEffect: msg.lightEffect || null,
    lightHold: msg.lightHold ?? null,
    autoCloseSeconds: msg.autoCloseSeconds ?? null,
    dist: msg.dist ?? null,
  });
}

function writeLocalDailyStats(acc) {
  if (!acc?.date) return;
  safeJsonWrite(localDailyStatsFile(acc.date), finalizeDailyStats(acc));
}

function readLocalDailyStat(date) {
  try {
    const file = localDailyStatsFile(date);
    if (!fs.existsSync(file)) return null;
    const row = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Luôn áp dụng lại rule bất thường khi đọc file.
    // Nhờ vậy nếu bạn đổi ngưỡng trong .env rồi restart server,
    // dữ liệu cũ vẫn được đánh dấu lại theo ngưỡng mới mà không cần seed lại.
    return applyStatAnomalyRules(row);
  } catch {
    return null;
  }
}

function dateIdsForLastLocal(days) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ids = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    ids.push(d.toISOString().slice(0, 10));
  }
  return ids;
}

function readLocalEvents(limit = 80, days = 30, dateFilter = '') {
  const rows = [];
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateFilter || '')) ? String(dateFilter) : '';

  if (safeDate) {
    rows.push(...readJsonLines(localEventFile(safeDate)));
  } else {
    for (const date of dateIdsForLastLocal(days).reverse()) {
      rows.push(...readJsonLines(localEventFile(date)));
      if (rows.length >= limit * 2) break;
    }
  }

  // Gộp event mới trong RAM với event đã lưu file. Một số event thật vừa phát sinh
  // được push qua SSE ngay, nhưng appendFile có thể chưa kịp hoàn tất khi dashboard
  // gọi lại /events. Nếu không gộp, log sẽ hiện rồi biến mất trong lần refresh kế tiếp.
  const byId = new Map();
  for (const event of [...recentLocalEventsBuffer, ...rows]) {
    if (!event) continue;
    if (safeDate && String(event.createdAtIso || '').slice(0, 10) !== safeDate) continue;
    const key = event.id || `${event.type}:${event.target}:${event.source}:${event.createdAtIso}:${event.message}`;
    if (!byId.has(key)) byId.set(key, event);
  }

  return [...byId.values()]
    .sort((a, b) => String(b.createdAtIso || '').localeCompare(String(a.createdAtIso || '')))
    .slice(0, limit);
}
const PORT = parseInt(process.env.PORT, 10) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'smart-home-dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

// ─── FIRESTORE SOFT MODE ─────────────────────────────────────────────
// Mục tiêu: giao tiếp ESP32/WebSocket luôn được ưu tiên.
// Khi Firestore hết quota/chậm/lỗi mạng, server chỉ log nhẹ và tiếp tục chạy.
const FIRESTORE_SOFT_MODE = process.env.FIRESTORE_SOFT_MODE !== 'false';
const FIRESTORE_WRITE_ENABLED = process.env.FIRESTORE_WRITE_ENABLED !== 'false';
const FIRESTORE_READ_TIMEOUT_MS = Math.max(300, parseInt(process.env.FIRESTORE_READ_TIMEOUT_MS, 10) || 1500);
const FIRESTORE_WRITE_TIMEOUT_MS = Math.max(300, parseInt(process.env.FIRESTORE_WRITE_TIMEOUT_MS, 10) || 1500);
const FIRESTORE_QUIET_MS = Math.max(5000, parseInt(process.env.FIRESTORE_QUIET_MS, 10) || 60000);
const FIRESTORE_QUOTA_PAUSE_MS = Math.max(60000, parseInt(process.env.FIRESTORE_QUOTA_PAUSE_MS, 10) || 10 * 60 * 1000);

let firestorePausedUntil = 0;
let lastFirestoreWarnAt = 0;
let lastEsp32Config = null;
let lastEsp32PeriodicSyncAt = 0;
const ESP32_CONFIG_SYNC_INTERVAL_MS = Math.max(60000, parseInt(process.env.ESP32_CONFIG_SYNC_INTERVAL_MS, 10) || 60 * 60 * 1000);

// Các giá trị vừa chỉnh từ web được giữ trong RAM + file local để sync ngay xuống ESP32.
// Không chờ Firestore ghi xong vì Firestore có thể chậm/hết quota.
const LOCAL_CONFIG_CACHE_PATH = path.join(LOG_DIR, 'runtime-config-cache.json');

function loadLocalConfigCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LOCAL_CONFIG_CACHE_PATH, 'utf8'));
    return {
      autoCloseSeconds: boundedAutoCloseSeconds?.(parsed.autoCloseSeconds) || parsed.autoCloseSeconds || null,
      fan: parsed.fan || null,
      light: parsed.light || null,
    };
  } catch {
    return { autoCloseSeconds: null, fan: null, light: null };
  }
}

function saveLocalConfigCache() {
  fs.writeFile(LOCAL_CONFIG_CACHE_PATH, JSON.stringify(configOverrides, null, 2), 'utf8', err => {
    if (err) writeTempLog('WARN', `Khong luu duoc runtime config cache: ${err.message}`);
  });
}

const configOverrides = loadLocalConfigCache();

const runtimeStats = {
  startedAt: new Date().toISOString(),
  statusUpdates: 0,
  events: 0,
  commands: 0,
  unlocks: 0,
  failedCommands: 0,
  lockouts: 0,
  motionEvents: 0,
  garageEvents: 0,
  fanEvents: 0,
  alerts: 0,
};

let rfidEnrollment = null;

function nowIso() { return new Date().toISOString(); }

function normalizeUid(uid = '') {
  return String(uid).trim().toUpperCase().replace(/[:-]/g, ' ').replace(/\s+/g, ' ');
}

function parseBool(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'on', 'enabled'].includes(String(value).toLowerCase());
}

function localMinutes(date = new Date()) {
  const text = date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh',
  });
  const [h, m] = text.split(':').map(Number);
  return h * 60 + m;
}

function minutesFromHHMM(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function isExpired(record, date = new Date()) {
  const expiresAt = record.expiresAtIso || record.expiresAt;
  if (!expiresAt) return false;
  const expiryMs = Date.parse(expiresAt);
  return Number.isFinite(expiryMs) && expiryMs <= date.getTime();
}

function accessAllowed(record, date = new Date()) {
  if (!record || record.enabled === false) return { ok: false, reason: 'disabled' };
  if (isExpired(record, date)) return { ok: false, reason: 'expired' };

  const accessType = record.accessType || 'full_time';
  if (accessType === 'full_time' || record.type === 'master') return { ok: true };

  if (accessType === 'time_window') {
    const start = minutesFromHHMM(record.timeWindow?.start || record.startTime);
    const end = minutesFromHHMM(record.timeWindow?.end || record.endTime);
    if (start == null || end == null) return { ok: false, reason: 'invalid_time_window' };
    const now = localMinutes(date);
    const inside = start <= end ? now >= start && now <= end : now >= start || now <= end;
    return inside ? { ok: true } : { ok: false, reason: 'outside_time_window' };
  }

  if (accessType === 'date_range') {
    const startIso = record.dateRange?.startIso || record.validFromIso || record.startDate;
    const endIso = record.dateRange?.endIso || record.validUntilIso || record.endDate;
    const nowMs = date.getTime();
    const startMs = startIso ? Date.parse(startIso) : -Infinity;
    const endMs = endIso ? Date.parse(endIso) : Infinity;
    if (!Number.isFinite(startMs) && startIso) return { ok: false, reason: 'invalid_start_date' };
    if (!Number.isFinite(endMs) && endIso) return { ok: false, reason: 'invalid_end_date' };
    return nowMs >= startMs && nowMs <= endMs ? { ok: true } : { ok: false, reason: 'outside_date_range' };
  }

  return { ok: false, reason: 'unsupported_access_type' };
}

function isFirestoreQuotaError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('resource_exhausted')
      || msg.includes('quota exceeded')
      || msg.includes('quota')
      || err?.code === 8;
}

function shouldSkipFirestore() {
  return FIRESTORE_SOFT_MODE && Date.now() < firestorePausedUntil;
}

function logFirestoreSoftError(label, err) {
  const now = Date.now();
  if (isFirestoreQuotaError(err)) {
    firestorePausedUntil = Math.max(firestorePausedUntil, now + FIRESTORE_QUOTA_PAUSE_MS);
  }
  if (now - lastFirestoreWarnAt < FIRESTORE_QUIET_MS) return;
  lastFirestoreWarnAt = now;

  const reason = isFirestoreQuotaError(err)
    ? `quota exceeded, tam dung Firestore ${Math.ceil((firestorePausedUntil - now) / 1000)}s`
    : (err?.message || String(err));
  writeTempLog('WARN', `Firestore phu tro bi bo qua (${label}): ${reason}`);
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}_TIMEOUT_${ms}MS`)), ms)),
  ]);
}

function runFirestoreWrite(label, task) {
  if (!FIRESTORE_WRITE_ENABLED || shouldSkipFirestore()) return;

  // Fire-and-forget: không await ở route điều khiển, không làm chậm WebSocket ESP32.
  withTimeout(Promise.resolve().then(task), FIRESTORE_WRITE_TIMEOUT_MS, 'FIRESTORE_WRITE')
    .catch(err => logFirestoreSoftError(label, err));
}

async function runFirestoreRead(label, task, fallbackValue = null) {
  if (shouldSkipFirestore()) return fallbackValue;
  try {
    return await withTimeout(Promise.resolve().then(task), FIRESTORE_READ_TIMEOUT_MS, 'FIRESTORE_READ');
  } catch (err) {
    logFirestoreSoftError(label, err);
    if (FIRESTORE_SOFT_MODE) return fallbackValue;
    throw err;
  }
}

function writeFirestore(collection, data) {
  runFirestoreWrite(`add:${collection}`, () => db.collection(collection).add({
    ...data,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtIso: nowIso(),
  }));
}

function setFirestoreDoc(pathName, data) {
  runFirestoreWrite(`set:${pathName}`, () => db.doc(pathName).set({
    ...data,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAtIso: nowIso(),
  }, { merge: true }));
}

function signUser(user) {
  return jwt.sign(
    {
      sub: user.userId,
      username: user.username || user.userId,
      role: user.role || 'viewer',
      displayName: user.displayName || user.username || user.userId,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

async function findWebUser(username) {
  const userId = String(username || '').trim();
  if (!userId) return null;

  const direct = await db.collection('webUsers').doc(userId).get();
  if (direct.exists) return { id: direct.id, ...direct.data() };

  const byUsername = await db.collection('webUsers')
    .where('username', '==', userId)
    .limit(1)
    .get();
  if (byUsername.empty) return null;

  const doc = byUsername.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function authUserFromToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  const user = await authUserFromToken(token);
  if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
  req.user = user;
  next();
}

// ─── SSE (Server-Sent Events → Dashboard) ────────────────────────────
const sseClients = [];

app.get('/log-stream', async (req, res) => {
  const user = await authUserFromToken(req.query.token);
  if (!user) return res.status(401).end('UNAUTHORIZED');

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();
  sseClients.push(res);
  req.on('close', () => {
    const i = sseClients.indexOf(res);
    if (i !== -1) sseClients.splice(i, 1);
  });
});

function pushLog(level, message) {
  const payload = JSON.stringify({ time: getTime(), timestamp: nowIso(), level, message });
  sseClients.forEach(c => c.write(`data: ${payload}\n\n`));
}

// ─── LOG HELPER ───────────────────────────────────────────────────────
let lastDoorState  = null;
let lastGarageState = null;
let lastOpenSource = null;
let lockoutSeconds = 30;
const recentLocalEventKeys = new Map();
const recentLocalEventsBuffer = [];
const RECENT_LOCAL_EVENT_BUFFER_MAX = 200;

function getDate() { return localDateParts().date; }
function getTime() { return new Date().toLocaleTimeString('vi-VN'); }
function localDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((out, part) => {
    out[part.type] = part.value;
    return out;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: parts.hour === '24' ? '00' : parts.hour,
  };
}

const SOURCE_MAP = {
  'App/Web':    'Ung dung / Web',
  'Mat Khau':   'Keypad (Mat khau)',
  'The Tu':     'The tu (RFID)',
  'Khach(OTP)': 'Ma khach (OTP)',
};
function sourceName(s) { return SOURCE_MAP[s] || s; }

function writePermLog(level, message) {
  const line = `[${getTime()}] [${level}] ${message}\n`;
  fs.appendFile(
    path.join(LOG_DIR, `door-${getDate()}.log`),
    line, 'utf8',
    err => { if (err) console.error(err.message); }
  );
  console.log('[PERM]', line.trim());
  pushLog(level, message);
}

function writeTempLog(level, message) {
  console.log('[TEMP]', `[${getTime()}] [${level}] ${message}`);
}

function getLanAddresses() {
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const infos of Object.values(nets)) {
    for (const info of infos || []) {
      if (info.family === 'IPv4' && !info.internal) addresses.push(info.address);
    }
  }
  return addresses;
}

// ─── WEBSOCKET SERVER (ESP32 kết nối vào đây) ────────────────────────
//   ESP32 kết nối: ws://<IP-LAN-cua-server>:PORT/ws/esp32
const wss     = new WebSocket.Server({ noServer: true });
let   esp32Ws = null;
const pending = new Map(); // id → { resolve, reject, timer }
let   lastStatus = {};     // cache push mới nhất từ ESP32
let   lastStatusAtMs = 0;   // mốc thời gian server nhận status thật gần nhất
const ESP32_STATUS_STALE_MS = Math.max(15000, parseInt(process.env.ESP32_STATUS_STALE_MS, 10) || 45000);

function esp32SocketOpen() {
  return !!(esp32Ws && esp32Ws.readyState === WebSocket.OPEN);
}

function esp32StatusFresh() {
  return !!lastStatusAtMs && Date.now() - lastStatusAtMs <= ESP32_STATUS_STALE_MS;
}

function esp32Online() {
  return esp32SocketOpen() && esp32StatusFresh();
}
let   lastServerCommandAt = 0;
const SERVER_COMMAND_INTERVAL_MS = 500;
const FIRESTORE_STATE_INTERVAL_MS = 10000;
const DAILY_STATS_INTERVAL_MS = Math.max(0, parseInt(process.env.DAILY_STATS_INTERVAL_MS, 10) || 0);
const TEMP_ALERT_HIGH = Number(process.env.TEMP_ALERT_HIGH || 38);
const TEMP_ALERT_DELTA = Number(process.env.TEMP_ALERT_DELTA || 5);
const HUMIDITY_ALERT_HIGH = Number(process.env.HUMIDITY_ALERT_HIGH || 85);
const HUMIDITY_ALERT_LOW = Number(process.env.HUMIDITY_ALERT_LOW || 25);

// Ngưỡng đánh dấu bất thường cho thống kê local.
// Chỉnh các giá trị này trong file .env, restart server là dashboard tự cập nhật theo.
const FAILED_ACCESS_ALERT_HOURLY = Number(process.env.FAILED_ACCESS_ALERT_HOURLY || 3);
const FAILED_ACCESS_ALERT_DAILY = Number(process.env.FAILED_ACCESS_ALERT_DAILY || 10);
const LOCKOUT_ALERT_HOURLY = Number(process.env.LOCKOUT_ALERT_HOURLY || 1);
const LOCKOUT_ALERT_DAILY = Number(process.env.LOCKOUT_ALERT_DAILY || 2);
const FAN_ON_MINUTES_ALERT_HOURLY = Number(process.env.FAN_ON_MINUTES_ALERT_HOURLY || 45);
const LIGHT_ON_MINUTES_ALERT_HOURLY = Number(process.env.LIGHT_ON_MINUTES_ALERT_HOURLY || 45);
const FAN_ON_MINUTES_ALERT_DAILY = Number(process.env.FAN_ON_MINUTES_ALERT_DAILY || 360);
const LIGHT_ON_MINUTES_ALERT_DAILY = Number(process.env.LIGHT_ON_MINUTES_ALERT_DAILY || 480);
let lastFirestoreStateAt = 0;
let lastDailyStatsAt = 0;
let lastPersistedStatus = {};
let lastAnomalyAt = {};
const usageTracker = {
  day: getDate(),
  lightOnSince: null,
  fanOnSince: null,
  lightOnMs: 0,
  fanOnMs: 0,
  lastUsageAt: Date.now(),
};
let dailyAccumulator = null;

// Upgrade HTTP → WebSocket chỉ tại đường dẫn /ws/esp32
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws/esp32') {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, req) => {
  // Nếu đang có ESP32 cũ chưa ngắt, đóng cũ đi
  if (esp32Ws && esp32Ws.readyState === WebSocket.OPEN) {
    esp32Ws.close();
  }
  esp32Ws = ws;
  writePermLog('INFO', `ESP32 ket noi WebSocket [${req.socket.remoteAddress}]`);
  lastEsp32PeriodicSyncAt = Date.now();
  pushEsp32ConfigSync(ws); // bắt buộc sync 1 lần khi ESP32 bắt tay/kết nối lại

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch (e) { writeTempLog('ERROR', 'WS JSON parse: ' + e.message); return; }

    // ── Response cho lệnh đã gửi (có correlation ID) ──────────────
    if (msg.id && pending.has(msg.id)) {
      const { resolve, timer } = pending.get(msg.id);
      clearTimeout(timer);
      pending.delete(msg.id);
      resolve(msg.result || 'OK');
      return;
    }

    // ── Status push định kỳ từ ESP32 ──────────────────────────────
    if (msg.type === 'status') {
      handleStatusPush(msg);
      return;
    }

    // ── Event push (open, close, lockout, …) ──────────────────────
    if (msg.type === 'event') {
      handleEventMsg(msg.event, msg.source, msg);
      return;
    }

    if (msg.type === 'auth_request') {
      handleAuthRequest(msg);
      return;
    }

    if (msg.type === 'config_request') {
      const now = Date.now();
      const force = msg.force === true || msg.reason === 'connect';
      if (force || now - lastEsp32PeriodicSyncAt >= ESP32_CONFIG_SYNC_INTERVAL_MS) {
        lastEsp32PeriodicSyncAt = now;
        pushEsp32ConfigSync(ws);
      } else {
        writeTempLog('INFO', 'Bo qua config_request som: da sync gan day');
      }
      return;
    }
  });

  ws.on('close', () => {
    if (esp32Ws === ws) esp32Ws = null;
    writePermLog('WARN', 'ESP32 ngat ket noi WebSocket');
    pushLog('EVENT', JSON.stringify({
      id: `esp32_offline_${Date.now()}`,
      type: 'esp32_disconnected',
      source: 'system',
      target: 'esp32',
      message: 'ESP32 đã ngắt kết nối WebSocket',
      createdAtIso: nowIso(),
      time: getTime(),
    }));
    // Reject tất cả lệnh đang chờ response
    for (const [, { reject, timer }] of pending) {
      clearTimeout(timer);
      reject(new Error('ESP32_DISCONNECTED'));
    }
    pending.clear();
  });

  ws.on('error', err => writeTempLog('ERROR', 'ESP32 WS error: ' + err.message));
});

/**
 * Gửi lệnh đến ESP32 và chờ response (Promise).
 * ESP32 phải reply { id, result } để resolve.
 */
function sendCmd(cmd, payload = null, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (!esp32Ws || esp32Ws.readyState !== WebSocket.OPEN) {
      return reject(new Error('ESP32_OFFLINE'));
    }
    const now = Date.now();
    if (cmd !== 'status' && now - lastServerCommandAt < SERVER_COMMAND_INTERVAL_MS) {
      return reject(new Error('COMMAND_COOLDOWN'));
    }
    if (cmd !== 'status') lastServerCommandAt = now;
    const id  = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const msg = { id, cmd };
    if (payload !== null) msg.payload = String(payload);

    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('WS_TIMEOUT'));
    }, timeoutMs);

    pending.set(id, { resolve, reject, timer });
    esp32Ws.send(JSON.stringify(msg));
  });
}

function sendWsJson(msg) {
  if (!esp32Ws || esp32Ws.readyState !== WebSocket.OPEN) return false;
  esp32Ws.send(JSON.stringify(msg));
  return true;
}


function toEpochMs(value) {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function accessRecordToDevice(record, extra = {}, globalAutoCloseSeconds = 30) {
  const accessType = record.accessType || 'full_time';
  const out = {
    enabled: record.enabled !== false,
    target: record.target === 'garageDoor' ? 'garageDoor' : 'mainDoor',
    accessType,
    // RFID/keypad không còn cấu hình tự đóng riêng. Luôn dùng thời gian tự đóng chung của hệ thống.
    autoCloseSeconds: boundedAutoCloseSeconds(globalAutoCloseSeconds) || 30,
    ...extra,
  };
  if (accessType === 'time_window') {
    out.startMinute = minutesFromHHMM(record.timeWindow?.start || record.startTime);
    out.endMinute = minutesFromHHMM(record.timeWindow?.end || record.endTime);
  }
  if (accessType === 'date_range') {
    out.validFromMs = toEpochMs(record.dateRange?.startIso || record.validFromIso || record.startDate);
    out.validUntilMs = toEpochMs(record.dateRange?.endIso || record.validUntilIso || record.endDate);
  }
  out.expiresAtMs = toEpochMs(record.expiresAtIso || record.expiresAt);
  return out;
}

function boundedAutoCloseSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return null;
  return Math.max(1, Math.min(600, Math.round(seconds)));
}

function boundedPercent(value, fallback = null) {
  const pct = Number(value);
  if (!Number.isFinite(pct)) return fallback;
  return Math.max(1, Math.min(100, Math.round(pct)));
}

function resolveUnifiedAutoCloseSeconds(settings = {}, mainDoor = {}, garage = {}) {
  const settingsSeconds = boundedAutoCloseSeconds(settings.autoCloseSeconds);
  if (settingsSeconds) return settingsSeconds;

  const mainSeconds = boundedAutoCloseSeconds(mainDoor.autoCloseSeconds);
  const garageSeconds = boundedAutoCloseSeconds(garage.autoCloseSeconds);
  if (mainSeconds && garageSeconds) return mainSeconds === garageSeconds ? mainSeconds : garageSeconds;
  return mainSeconds || garageSeconds || 30;
}

async function readUnifiedAutoCloseSeconds() {
  const overrideSeconds = boundedAutoCloseSeconds(configOverrides.autoCloseSeconds);
  if (overrideSeconds) return overrideSeconds;

  const docs = await runFirestoreRead('read:autoCloseSeconds', () => Promise.all([
    db.doc('systemSettings/main').get(),
    db.doc('devices/mainDoor').get(),
    db.doc('devices/garageDoor').get(),
  ]), null);

  if (!docs) {
    return boundedAutoCloseSeconds(lastStatus.autoCloseSeconds)
        || boundedAutoCloseSeconds(lastEsp32Config?.autoCloseSeconds)
        || 30;
  }

  const [settingsDoc, mainDoorDoc, garageDoc] = docs;
  const settings = settingsDoc.exists ? settingsDoc.data() : {};
  const mainDoor = mainDoorDoc.exists ? mainDoorDoc.data() : {};
  const garage = garageDoc.exists ? garageDoc.data() : {};
  return resolveUnifiedAutoCloseSeconds(settings, mainDoor, garage);
}

function normalizeAccessPolicy(body = {}, fallback = {}) {
  // accessType = phạm vi quyền truy cập; expiresAtIso/relativeMinutes = lớp hết hạn độc lập.
  // relativeMinutes: có hiệu lực từ bây giờ đến X phút sau.
  // expiresAtIso: có hiệu lực từ hiện tại đến ngày/giờ được chọn nếu accessType là full_time.
  const accessType = ['full_time', 'time_window', 'date_range'].includes(body.accessType)
    ? body.accessType
    : (fallback.accessType || 'full_time');
  const relativeMinutes = Number(body.relativeMinutes || 0);
  const expiresAtIso = relativeMinutes > 0
    ? new Date(Date.now() + Math.max(1, Math.min(525600, Math.round(relativeMinutes))) * 60000).toISOString()
    : (body.expiresAtIso === undefined ? (fallback.expiresAtIso || null) : (body.expiresAtIso || null));
  const out = {
    accessType,
    timeWindow: null,
    dateRange: null,
    expiresAtIso,
  };

  if (accessType === 'time_window') {
    const start = body.timeWindow?.start || body.startTime || fallback.timeWindow?.start;
    const end = body.timeWindow?.end || body.endTime || fallback.timeWindow?.end;
    if (minutesFromHHMM(start) == null || minutesFromHHMM(end) == null) {
      throw new Error('INVALID_TIME_WINDOW');
    }
    out.timeWindow = { start, end };
  }

  if (accessType === 'date_range') {
    const startIso = body.dateRange?.startIso || body.validFromIso || fallback.dateRange?.startIso;
    const endIso = body.dateRange?.endIso || body.validUntilIso || fallback.dateRange?.endIso;
    if (!startIso || !endIso || !Number.isFinite(Date.parse(startIso)) || !Number.isFinite(Date.parse(endIso))) {
      throw new Error('INVALID_DATE_RANGE');
    }
    if (Date.parse(startIso) > Date.parse(endIso)) throw new Error('DATE_RANGE_REVERSED');
    out.dateRange = { startIso, endIso };
  }

  if (out.expiresAtIso && !Number.isFinite(Date.parse(out.expiresAtIso))) {
    throw new Error('INVALID_EXPIRES_AT');
  }
  return out;
}

async function buildEsp32Config() {
  const docs = await runFirestoreRead('read:esp32Config', () => Promise.all([
    db.collection('accessCards').limit(200).get(),
    db.collection('accessPasswords').limit(200).get(),
    db.doc('devices/environmentFan').get(),
    db.doc('devices/hallwayLight').get(),
    db.doc('devices/garageDoor').get(),
    db.doc('devices/mainDoor').get(),
    db.doc('systemSettings/main').get(),
  ]), null);

  if (!docs) {
    return lastEsp32Config || {
      type: 'config_sync',
      version: Date.now(),
      nowMs: Date.now(),
      autoCloseSeconds: boundedAutoCloseSeconds(lastStatus.autoCloseSeconds) || 30,
      doorOpenSeconds: boundedAutoCloseSeconds(lastStatus.autoCloseSeconds) || 30,
      garageCloseSeconds: boundedAutoCloseSeconds(lastStatus.autoCloseSeconds) || 30,
      fan: { tempOn: 35, tempOff: 33, humOn: 40, humOff: 45, autoSpeed: 60 },
      light: { holdSeconds: 20, brightness: 70, effect: 'static' },
      cards: [],
      passwords: [],
    };
  }

  const [cardsSnap, passwordsSnap, fanDoc, lightDoc, garageDoc, mainDoorDoc, settingsDoc] = docs;

  const fan = fanDoc.exists ? fanDoc.data() : {};
  const light = lightDoc.exists ? lightDoc.data() : {};
  const garage = garageDoc.exists ? garageDoc.data() : {};
  const mainDoor = mainDoorDoc.exists ? mainDoorDoc.data() : {};
  const settings = settingsDoc.exists ? settingsDoc.data() : {};

  const tempOn = Number(configOverrides.fan?.tempOn ?? fan.temperatureOnThreshold ?? 35);
  const tempOff = Number(configOverrides.fan?.tempOff ?? fan.temperatureOffThreshold ?? 33);
  const humOn = Number(configOverrides.fan?.humOn ?? fan.humidityOnThreshold ?? 40);
  const humOff = Number(configOverrides.fan?.humOff ?? fan.humidityOffThreshold ?? 45);
  const fanAutoSpeed = boundedPercent(configOverrides.fan?.autoSpeed ?? fan.autoSpeedPct ?? fan.autoSpeed ?? fan.speed, 60);

  const autoCloseSeconds = boundedAutoCloseSeconds(configOverrides.autoCloseSeconds)
    || resolveUnifiedAutoCloseSeconds(settings, mainDoor, garage);
  if (
    settings.autoCloseSeconds !== autoCloseSeconds ||
    mainDoor.autoCloseSeconds !== autoCloseSeconds ||
    garage.autoCloseSeconds !== autoCloseSeconds
  ) {
    setFirestoreDoc('systemSettings/main', { autoCloseSeconds });
    setFirestoreDoc('devices/mainDoor', { autoCloseSeconds });
    setFirestoreDoc('devices/garageDoor', { autoCloseSeconds });
  }

  const cards = cardsSnap.docs.map(doc => {
    const record = doc.data();
    return accessRecordToDevice(record, {
      uid: normalizeUid(record.uid),
      source: record.target === 'garageDoor' ? 'The Gara' : 'The Tu',
    }, autoCloseSeconds);
  }).filter(card => card.uid);

  const passwords = passwordsSnap.docs.map(doc => {
    const record = doc.data();
    // ESP32 không thể kiểm tra bcrypt trực tiếp, vì vậy cần pinPlain để cache local.
    const pin = record.pinPlain || record.pin || record.password;
    return accessRecordToDevice(record, {
      pin: pin ? String(pin) : '',
      type: record.type || 'temporary',
      source: record.type === 'master' ? 'Mat Khau' : 'Khach(OTP)',
    }, autoCloseSeconds);
  }).filter(pass => pass.pin && pass.pin.length >= 4 && pass.pin.length <= 16);

  return {
    type: 'config_sync',
    version: Date.now(),
    nowMs: Date.now(),
    autoCloseSeconds,
    doorOpenSeconds: autoCloseSeconds,
    garageCloseSeconds: autoCloseSeconds,
    fan: { tempOn, tempOff, humOn, humOff, autoSpeed: fanAutoSpeed },
    light: {
      holdSeconds: Math.max(1, Math.min(600, Number(configOverrides.light?.holdSeconds ?? light.minOnSeconds ?? 20))),
      brightness: Math.max(10, Math.min(100, Number(configOverrides.light?.brightness ?? light.maxBrightness ?? 70))),
      effect: ['static', 'blink', 'fading'].includes(String(configOverrides.light?.effect ?? light.effect ?? '').toLowerCase())
        ? String(configOverrides.light?.effect ?? light.effect).toLowerCase()
        : 'static',
    },
    cards,
    passwords,
  };
}

async function pushEsp32ConfigSync(ws = esp32Ws) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    const config = await buildEsp32Config();
    lastEsp32Config = config;
    ws.send(JSON.stringify(config));
    writeTempLog('INFO', `Da sync config xuong ESP32: cards=${config.cards.length}, passwords=${config.passwords.length}`);
    return true;
  } catch (e) {
    writeTempLog('ERROR', `Sync config ESP32 failed: ${e.message}`);
    return false;
  }
}


function patchLastEsp32Config(patch = {}) {
  const base = lastEsp32Config || {
    type: 'config_sync',
    version: Date.now(),
    nowMs: Date.now(),
    autoCloseSeconds: boundedAutoCloseSeconds(lastStatus.autoCloseSeconds) || 30,
    doorOpenSeconds: boundedAutoCloseSeconds(lastStatus.autoCloseSeconds) || 30,
    garageCloseSeconds: boundedAutoCloseSeconds(lastStatus.autoCloseSeconds) || 30,
    fan: { tempOn: 35, tempOff: 33, humOn: 40, humOff: 45, autoSpeed: 60 },
    light: { holdSeconds: 20, brightness: 70, effect: 'static' },
    cards: [],
    passwords: [],
  };
  lastEsp32Config = {
    ...base,
    ...patch,
    version: Date.now(),
    nowMs: Date.now(),
    fan: { ...(base.fan || {}), ...(patch.fan || {}) },
    light: { ...(base.light || {}), ...(patch.light || {}) },
  };
  return lastEsp32Config;
}

async function sendCommandResponse(res, cmd, payload = null, logPrefix = null, timeoutMs = 5000) {
  if (logPrefix) writeTempLog('INFO', `${logPrefix}: cmd=${cmd} payload=${payload || ''}`);
  runtimeStats.commands++;
  try {
    const result = await sendCmd(cmd, payload, timeoutMs);
    res.send(result);
    return true;
  } catch (e) {
    runtimeStats.failedCommands++;
    const code = e.message === 'ESP32_OFFLINE' || e.message === 'ESP32_DISCONNECTED'
      ? 503
      : e.message === 'WS_TIMEOUT'
        ? 504
        : 502;
    writeTempLog('ERROR', `Cmd ${cmd} that bai: ${e.message}`);
    res.status(code).send(e.message === 'ESP32_DISCONNECTED' ? 'ESP32_OFFLINE' : e.message);
    return false;
  }
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function emptyHourBucket() {
  return {
    sampleCount: 0,
    tempSum: 0,
    tempCount: 0,
    humiditySum: 0,
    humidityCount: 0,
    minTemperature: null,
    maxTemperature: null,
    minHumidity: null,
    maxHumidity: null,
    lightOnMinutes: 0,
    fanOnMinutes: 0,
    unlocks: 0,
    failedAccess: 0,
    garageEvents: 0,
    lockouts: 0,
    anomalies: 0,
    anomalyTags: [],
  };
}

function createDailyAccumulator(date) {
  const hourly = {};
  for (let h = 0; h < 24; h++) hourly[String(h).padStart(2, '0')] = emptyHourBucket();
  return {
    date,
    hourly,
    lightOnMinutes: 0,
    fanOnMinutes: 0,
    unlocks: 0,
    failedAccess: 0,
    garageEvents: 0,
    lockouts: 0,
    anomalies: 0,
    anomalyTags: [],
    statusUpdates: 0,
    avgTemperature: null,
    avgHumidity: null,
    minTemperature: null,
    maxTemperature: null,
    minHumidity: null,
    maxHumidity: null,
    lastTemperature: null,
    lastHumidity: null,
  };
}

function numberOr(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mergeSavedDailyStats(date) {
  const base = createDailyAccumulator(date);
  const saved = readLocalDailyStat(date);
  if (!saved || typeof saved !== 'object') return base;

  const merged = { ...base, ...saved, date };
  merged.hourly = { ...base.hourly };
  const savedHourly = saved.hourly && typeof saved.hourly === 'object' ? saved.hourly : {};
  for (let h = 0; h < 24; h++) {
    const key = String(h).padStart(2, '0');
    merged.hourly[key] = { ...emptyHourBucket(), ...(savedHourly[key] || {}) };
  }

  merged.lightOnMinutes = numberOr(merged.lightOnMinutes, 0);
  merged.fanOnMinutes = numberOr(merged.fanOnMinutes, 0);
  merged.unlocks = numberOr(merged.unlocks, 0);
  merged.failedAccess = numberOr(merged.failedAccess, 0);
  merged.garageEvents = numberOr(merged.garageEvents, 0);
  merged.lockouts = numberOr(merged.lockouts, 0);
  merged.statusUpdates = numberOr(merged.statusUpdates, 0);
  if (!Array.isArray(merged.anomalyTags)) merged.anomalyTags = [];
  return merged;
}

function restoreUsageTrackerFromAccumulator(acc) {
  usageTracker.day = acc.date;
  usageTracker.lightOnSince = null;
  usageTracker.fanOnSince = null;
  usageTracker.lightOnMs = Math.max(0, numberOr(acc.lightOnMinutes, 0) * 60000);
  usageTracker.fanOnMs = Math.max(0, numberOr(acc.fanOnMinutes, 0) * 60000);
  usageTracker.lastUsageAt = Date.now();
}

function ensureDailyAccumulator(date = getDate()) {
  if (!dailyAccumulator || dailyAccumulator.date !== date) {
    // Quan trọng: khi server restart, nạp lại thống kê local đã ghi trước đó.
    // Nếu không, status push đầu tiên sau restart sẽ tạo accumulator rỗng và ghi đè file daily-stats.
    dailyAccumulator = mergeSavedDailyStats(date);
    restoreUsageTrackerFromAccumulator(dailyAccumulator);
  }
  return dailyAccumulator;
}

function addSensorSample(acc, hour, msg) {
  const bucket = acc.hourly[hour] || (acc.hourly[hour] = emptyHourBucket());
  const temp = asNumber(msg.temp);
  const humidity = asNumber(msg.humidity);

  bucket.sampleCount += 1;
  acc.statusUpdates = runtimeStats.statusUpdates;

  if (temp !== null) {
    bucket.tempSum += temp;
    bucket.tempCount += 1;
    bucket.minTemperature = bucket.minTemperature === null ? temp : Math.min(bucket.minTemperature, temp);
    bucket.maxTemperature = bucket.maxTemperature === null ? temp : Math.max(bucket.maxTemperature, temp);
    acc.lastTemperature = temp;
  }
  if (humidity !== null) {
    bucket.humiditySum += humidity;
    bucket.humidityCount += 1;
    bucket.minHumidity = bucket.minHumidity === null ? humidity : Math.min(bucket.minHumidity, humidity);
    bucket.maxHumidity = bucket.maxHumidity === null ? humidity : Math.max(bucket.maxHumidity, humidity);
    acc.lastHumidity = humidity;
  }
}

function pushUniqueTag(target, tag) {
  if (!target || !tag) return;
  if (!Array.isArray(target.anomalyTags)) target.anomalyTags = [];
  if (!target.anomalyTags.includes(tag)) target.anomalyTags.push(tag);
}

function applyStatAnomalyRules(acc) {
  if (!acc || !acc.hourly) return acc;

  const statRuleTags = new Set([
    'temperature_high', 'humidity_high', 'humidity_low',
    'failed_access_high', 'lockout', 'fan_on_too_long', 'light_on_too_long',
    'failed_access_high_daily', 'lockout_high_daily',
    'fan_on_too_long_daily', 'light_on_too_long_daily'
  ]);

  // Tách rõ 2 loại anomaly:
  // - hourlyAnomalyTags: dùng cho biểu đồ 1 ngày theo giờ.
  // - dailyAnomalyTags: dùng cho biểu đồ 7/30 ngày theo ngày.
  // Nếu không tách, chỉ cần 1 giờ trong ngày vượt ngưỡng hourly cũng làm cả cột ngày bị đỏ,
  // khiến FAILED_ACCESS_ALERT_DAILY / LOCKOUT_ALERT_DAILY không có tác dụng trực quan.
  const preservedDailyTags = (Array.isArray(acc.anomalyTags) ? acc.anomalyTags : [])
    .filter(tag => !statRuleTags.has(tag));
  const hourlyAggregateTags = new Set();
  const dailyOnlyTags = new Set();
  let totalHourlyAnomalies = 0;

  for (const bucket of Object.values(acc.hourly)) {
    if (!bucket) continue;
    const preservedBucketTags = (Array.isArray(bucket.anomalyTags) ? bucket.anomalyTags : [])
      .filter(tag => !statRuleTags.has(tag));
    const tags = new Set(preservedBucketTags);

    const avgTemp = bucket.tempCount
      ? Number(bucket.tempSum || 0) / Number(bucket.tempCount)
      : Number(bucket.avgTemperature ?? bucket.maxTemperature ?? NaN);
    const avgHumidity = bucket.humidityCount
      ? Number(bucket.humiditySum || 0) / Number(bucket.humidityCount)
      : Number(bucket.avgHumidity ?? bucket.maxHumidity ?? NaN);

    if (Number.isFinite(avgTemp) && avgTemp >= TEMP_ALERT_HIGH) tags.add('temperature_high');
    if (Number.isFinite(avgHumidity) && avgHumidity >= HUMIDITY_ALERT_HIGH) tags.add('humidity_high');
    if (Number.isFinite(avgHumidity) && avgHumidity <= HUMIDITY_ALERT_LOW) tags.add('humidity_low');

    if (Number(bucket.failedAccess || 0) >= FAILED_ACCESS_ALERT_HOURLY) tags.add('failed_access_high');
    if (Number(bucket.lockouts || 0) >= LOCKOUT_ALERT_HOURLY) tags.add('lockout');
    if (Number(bucket.fanOnMinutes || 0) >= FAN_ON_MINUTES_ALERT_HOURLY) tags.add('fan_on_too_long');
    if (Number(bucket.lightOnMinutes || 0) >= LIGHT_ON_MINUTES_ALERT_HOURLY) tags.add('light_on_too_long');

    bucket.anomalyTags = [...tags];
    bucket.anomalies = bucket.anomalyTags.length;
    for (const tag of bucket.anomalyTags) hourlyAggregateTags.add(tag);
    totalHourlyAnomalies += bucket.anomalies;
  }

  if (Number(acc.failedAccess || 0) >= FAILED_ACCESS_ALERT_DAILY) dailyOnlyTags.add('failed_access_high_daily');
  if (Number(acc.lockouts || 0) >= LOCKOUT_ALERT_DAILY) dailyOnlyTags.add('lockout_high_daily');
  if (Number(acc.fanOnMinutes || 0) >= FAN_ON_MINUTES_ALERT_DAILY) dailyOnlyTags.add('fan_on_too_long_daily');
  if (Number(acc.lightOnMinutes || 0) >= LIGHT_ON_MINUTES_ALERT_DAILY) dailyOnlyTags.add('light_on_too_long_daily');

  acc.hourlyAnomalyTags = [...hourlyAggregateTags];
  acc.dailyAnomalyTags = [...dailyOnlyTags];
  acc.anomalyTags = [...new Set([...preservedDailyTags, ...acc.hourlyAnomalyTags, ...acc.dailyAnomalyTags])];
  acc.anomalies = totalHourlyAnomalies + acc.dailyAnomalyTags.length;
  return acc;
}

function finalizeDailyStats(acc) {
  let tempSum = 0;
  let tempCount = 0;
  let humiditySum = 0;
  let humidityCount = 0;
  let minTemp = null;
  let maxTemp = null;
  let minHumidity = null;
  let maxHumidity = null;

  for (const bucket of Object.values(acc.hourly)) {
    if (bucket.sampleCount > 0) {
      if (bucket.tempCount > 0) {
        tempSum += bucket.tempSum;
        tempCount += bucket.tempCount;
      }
      if (bucket.humidityCount > 0) {
        humiditySum += bucket.humiditySum;
        humidityCount += bucket.humidityCount;
      }
    }
    if (bucket.minTemperature !== null) minTemp = minTemp === null ? bucket.minTemperature : Math.min(minTemp, bucket.minTemperature);
    if (bucket.maxTemperature !== null) maxTemp = maxTemp === null ? bucket.maxTemperature : Math.max(maxTemp, bucket.maxTemperature);
    if (bucket.minHumidity !== null) minHumidity = minHumidity === null ? bucket.minHumidity : Math.min(minHumidity, bucket.minHumidity);
    if (bucket.maxHumidity !== null) maxHumidity = maxHumidity === null ? bucket.maxHumidity : Math.max(maxHumidity, bucket.maxHumidity);
  }

  const finalized = {
    ...acc,
    avgTemperature: tempCount ? Math.round((tempSum / tempCount) * 10) / 10 : acc.lastTemperature,
    avgHumidity: humidityCount ? Math.round((humiditySum / humidityCount) * 10) / 10 : acc.lastHumidity,
    minTemperature: minTemp,
    maxTemperature: maxTemp,
    minHumidity,
    maxHumidity,
  };
  return applyStatAnomalyRules(finalized);
}

function addDailyMetric(key, amount = 1, date = getDate(), hour = localDateParts().hour) {
  const acc = ensureDailyAccumulator(date);
  const bucket = acc.hourly[hour] || (acc.hourly[hour] = emptyHourBucket());
  acc[key] = (acc[key] || 0) + amount;
  bucket[key] = (bucket[key] || 0) + amount;
  // Event thật như mở cửa, mở gara, nhập sai, lockout phải được ghi ngay,
  // tránh mất thống kê nếu server restart trước lần flush định kỳ.
  writeLocalDailyStats(acc);
}

function writeAnomaly(type, message, metadata = {}) {
  const now = Date.now();
  if (lastAnomalyAt[type] && now - lastAnomalyAt[type] < 10 * 60 * 1000) return;
  lastAnomalyAt[type] = now;
  addDailyMetric('anomalies', 1);
  const acc = ensureDailyAccumulator(getDate());
  const hour = localDateParts().hour;
  const bucket = acc.hourly[hour] || (acc.hourly[hour] = emptyHourBucket());
  pushUniqueTag(bucket, type);
  bucket.anomalies = Math.max(Number(bucket.anomalies || 0), bucket.anomalyTags.length);
  pushUniqueTag(acc, type);
  writeLocalDailyStats(acc);
  writeLocalEvent({
    type: 'anomaly',
    source: 'system',
    target: metadata.target || 'environment',
    message,
    metadata,
  });
  pushLog('WARN', message);
}

function changedField(msg, previous, keys) {
  return keys.some(key => String(msg[key] ?? '') !== String(previous[key] ?? ''));
}

function shouldPersistState(msg, now) {
  if (!lastFirestoreStateAt) return true;
  if (now - lastFirestoreStateAt >= FIRESTORE_STATE_INTERVAL_MS) return true;
  return changedField(msg, lastPersistedStatus, [
    'door', 'gara', 'garageMode', 'fan', 'fanPct', 'fanMode',
    'light', 'lightMode', 'lightBrightness', 'lightEffect', 'lightHold',
    'autoCloseSeconds', 'doorRemainingSeconds', 'garaRemainingSeconds',
  ]);
}

function persistStatusLocal(msg, dailyStats) {
  const now = Date.now();
  writeLocalStatusSample(msg);

  if (shouldPersistState(msg, now)) {
    lastFirestoreStateAt = now;
    lastPersistedStatus = { ...msg };
  }

  // Local file nhỏ nên ưu tiên an toàn dữ liệu: mặc định ghi stats ngay mỗi lần có status.
  // Có thể đặt DAILY_STATS_INTERVAL_MS trong .env nếu muốn giảm tần suất ghi.
  if (DAILY_STATS_INTERVAL_MS === 0 || !lastDailyStatsAt || now - lastDailyStatsAt >= DAILY_STATS_INTERVAL_MS) {
    writeLocalDailyStats(dailyStats);
    lastDailyStatsAt = now;
  }
}

async function validateRfidCredential(uid, target) {
  const normalizedUid = normalizeUid(uid);
  if (!normalizedUid) return { ok: false, reason: 'empty_uid' };

  const snap = await runFirestoreRead('read:validateRfid', () =>
    db.collection('accessCards').where('uid', '==', normalizedUid).limit(5).get(),
    null
  );

  if (!snap) return { ok: false, reason: 'firestore_unavailable' };
  if (snap.empty) return { ok: false, reason: 'card_not_found' };
  const doc = target === 'any' ? snap.docs[0] : snap.docs.find(item => item.data().target === target);
  if (!doc) return { ok: false, reason: 'card_target_mismatch' };
  const record = { id: doc.id, ...doc.data() };
  return { ...accessAllowed(record), record };
}

async function validatePasswordCredential(pin, target) {
  const rawPin = String(pin || '');
  if (rawPin.length < 4) return { ok: false, reason: 'pin_too_short' };

  const snap = await runFirestoreRead('read:validatePassword', () =>
    db.collection('accessPasswords')
      .where('target', '==', target)
      .get(),
    null
  );

  if (!snap) return { ok: false, reason: 'firestore_unavailable' };
  for (const doc of snap.docs) {
    const record = { id: doc.id, ...doc.data() };
    if (record.enabled === false) continue;
    if (!record.passwordHash || !String(record.passwordHash).startsWith('$2')) continue;
    const matches = await bcrypt.compare(rawPin, record.passwordHash);
    if (!matches) continue;
    const allowed = accessAllowed(record);
    return { ...allowed, record };
  }
  return { ok: false, reason: 'password_not_found' };
}

async function maybeEnrollCard(uid, target) {
  if (!rfidEnrollment || Date.now() > rfidEnrollment.expiresAt) return null;
  const normalizedUid = normalizeUid(uid);
  if (!normalizedUid) return null;

  const exists = await runFirestoreRead('read:enrollCardExists', () =>
    db.collection('accessCards').where('uid', '==', normalizedUid).limit(1).get(),
    null
  );
  if (!exists) return null;
  if (!exists.empty) return { enrolled: false, reason: 'card_exists' };

  const card = {
    uid: normalizedUid,
    name: rfidEnrollment.name || `Thẻ ${normalizedUid}`,
    target: rfidEnrollment.target || target || 'mainDoor',
    enabled: true,
    accessType: rfidEnrollment.accessType || 'full_time',
    timeWindow: rfidEnrollment.timeWindow || null,
    dateRange: rfidEnrollment.dateRange || null,
    expiresAtIso: rfidEnrollment.expiresAtIso || null,
    enrolledBy: rfidEnrollment.user || 'web',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtIso: nowIso(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAtIso: nowIso(),
  };
  const ref = await runFirestoreRead('write:enrollCard', () => db.collection('accessCards').add(card), null);
  if (!ref) return null;
  rfidEnrollment = null;
  writeLocalEvent({
    type: 'access_card_enrolled',
    source: 'rfid',
    target: card.target,
    message: `Đã ghi nhận thẻ RFID ${normalizedUid}`,
    metadata: { cardId: ref.id },
  });
  return { enrolled: true, id: ref.id, card };
}

async function handleAuthRequest(msg) {
  const requestId = msg.id || msg.requestId || `${Date.now()}`;
  const method = String(msg.method || '').toLowerCase();
  const target = msg.target === 'garageDoor' ? 'garageDoor' : msg.target === 'any' ? 'any' : 'mainDoor';
  const credential = String(msg.credential || '');

  try {
    if (method === 'rfid') {
      const enrollment = await maybeEnrollCard(credential, target);
      if (enrollment?.enrolled) {
        sendWsJson({ type: 'auth_result', requestId, allowed: false, reason: 'card_enrolled' });
        pushLog('INFO', `Da them the RFID ${enrollment.card.uid}`);
        return;
      }
    }

    const result = method === 'rfid'
      ? await validateRfidCredential(credential, target)
      : await validatePasswordCredential(credential, target);
    const allowed = !!result.ok;
    const resolvedTarget = result.record?.target || (target === 'any' ? 'mainDoor' : target);
    const source = method === 'rfid'
      ? (resolvedTarget === 'garageDoor' ? 'The Gara' : 'The Tu')
      : (result.record?.type === 'master' ? 'Mat Khau' : 'Khach(OTP)');
    if (!allowed) addDailyMetric('failedAccess', 1);

    writeLocalEvent({
      type: allowed ? 'access_success' : 'access_failed',
      source: method,
      target: resolvedTarget,
      message: allowed
        ? `Truy cập hợp lệ: ${result.record?.name || source}`
        : `Truy cập bị từ chối: ${result.reason || 'unknown'}`,
      metadata: { reason: result.reason || null, uid: method === 'rfid' ? normalizeUid(credential) : null },
    });

    if (result.record?.autoDeleteWhenExpired && result.record.type !== 'master' && isExpired(result.record)) {
      db.collection('accessPasswords').doc(result.record.id).delete().catch(() => {});
      pushEsp32ConfigSync();
    }

    const autoCloseSeconds = await readUnifiedAutoCloseSeconds();
    sendWsJson({
      type: 'auth_result',
      requestId,
      allowed,
      target: resolvedTarget,
      source,
      seconds: autoCloseSeconds,
      reason: result.reason || null,
    });
  } catch (e) {
    writeTempLog('ERROR', `Auth request failed: ${e.message}`);
    sendWsJson({ type: 'auth_result', requestId, allowed: false, reason: 'server_error' });
  }
}

// ─── HANDLER: Status push từ ESP32 ───────────────────────────────────
function handleStatusPush(msg) {
  lastStatusAtMs = Date.now();
  lastStatus = { ...msg, time: getTime(), lastSeenMs: lastStatusAtMs };
  delete lastStatus.type;
  runtimeStats.statusUpdates++;
  const dailyStats = updateUsageStats(msg);
  detectRealtimeAnomalies(msg);
  persistStatusLocal(msg, dailyStats);

  const newState = (msg.door || '').toUpperCase();
  const newGarageState = (msg.gara || '').toUpperCase();

  // Fallback: nếu ESP32 status báo cửa/gara đã mở nhưng event queue bị mất,
  // server vẫn ghi access log thật từ trạng thái realtime.
  if (newState === 'OPEN' && lastDoorState !== 'OPEN' && !lastOpenSource) {
    if (writeLocalEvent({
      type: 'access_success',
      source: 'status_fallback',
      target: 'mainDoor',
      message: 'Mở cửa chính',
      dedupeKey: 'mainDoor:open',
      dedupeMs: 5000,
    })) {
      runtimeStats.unlocks++;
      addDailyMetric('unlocks', 1);
    }
  }
  if (newGarageState === 'OPEN' && lastGarageState !== 'OPEN') {
    if (writeLocalEvent({
      type: 'access_success',
      source: 'status_fallback',
      target: 'garageDoor',
      message: 'Mở gara',
      dedupeKey: 'garageDoor:open',
      dedupeMs: 5000,
    })) {
      runtimeStats.garageEvents++;
      addDailyMetric('garageEvents', 1);
    }
  }
  lastGarageState = newGarageState;

  // Chỉ log khi trạng thái cửa thay đổi
  if (newState !== lastDoorState) {
    if (newState === 'OPEN') {
      const by = lastOpenSource
        ? ` boi: ${sourceName(lastOpenSource)}`
        : ' (nguon khong xac dinh)';
      writePermLog('INFO', `Cua da mo${by}`);
    } else if (newState === 'CLOSED') {
      const openedBy = lastOpenSource
        ? ` (da mo boi: ${sourceName(lastOpenSource)})`
        : '';
      writePermLog('INFO', `Cua da dong${openedBy}`);
      lastOpenSource = null;
    } else if (newState === 'LOCKED_OUT' && lastDoorState !== 'LOCKED_OUT') {
      writePermLog('WARN', `He thong bi khoa ${lockoutSeconds}s`);
      pushLog('LOCKOUT', `LOCKOUT:${lockoutSeconds}`);
    }
    lastDoorState = newState;
  }

  // Push realtime sensor data đến dashboard qua SSE (level STATUS)
  pushLog('STATUS', JSON.stringify({
    door:    msg.door,
    temp:    msg.temp,
    humidity: msg.humidity,
    motion:  msg.motion,
    gara:    msg.gara,
    garageMode: msg.garageMode,
    fan:     msg.fan,
    fanPct:  msg.fanPct,
    fanMode: msg.fanMode,
    light:   msg.light,
    lightMode: msg.lightMode,
    lightBrightness: msg.lightBrightness,
    lightEffect: msg.lightEffect,
    lightHold: msg.lightHold,
    autoCloseSeconds: msg.autoCloseSeconds,
    doorRemainingSeconds: msg.doorRemainingSeconds,
    garaRemainingSeconds: msg.garaRemainingSeconds,
    dist:    msg.dist,
  }));
}

function updateUsageStats(msg) {
  const { date: today, hour } = localDateParts();
  const acc = ensureDailyAccumulator(today);
  const now = Date.now();
  const lightOn = msg.light === true || msg.light === 'true' || msg.light === 'ON';
  const fanOn = msg.fan && msg.fan !== 'OFF';
  const elapsedMs = Math.max(0, Math.min(now - (usageTracker.lastUsageAt || now), 5 * 60 * 1000));

  if (lightOn && !usageTracker.lightOnSince) usageTracker.lightOnSince = now;
  if (!lightOn && usageTracker.lightOnSince) {
    usageTracker.lightOnMs += now - usageTracker.lightOnSince;
    usageTracker.lightOnSince = null;
  }
  if (fanOn && !usageTracker.fanOnSince) usageTracker.fanOnSince = now;
  if (!fanOn && usageTracker.fanOnSince) {
    usageTracker.fanOnMs += now - usageTracker.fanOnSince;
    usageTracker.fanOnSince = null;
  }
  if (lightOn && elapsedMs > 0) acc.hourly[hour].lightOnMinutes += elapsedMs / 60000;
  if (fanOn && elapsedMs > 0) acc.hourly[hour].fanOnMinutes += elapsedMs / 60000;
  usageTracker.lastUsageAt = now;

  const lightMs = usageTracker.lightOnMs + (usageTracker.lightOnSince ? now - usageTracker.lightOnSince : 0);
  const fanMs = usageTracker.fanOnMs + (usageTracker.fanOnSince ? now - usageTracker.fanOnSince : 0);
  acc.lightOnMinutes = Math.round(lightMs / 60000);
  acc.fanOnMinutes = Math.round(fanMs / 60000);
  addSensorSample(acc, hour, msg);
  return acc;
}

function detectRealtimeAnomalies(msg) {
  const temp = asNumber(msg.temp);
  const humidity = asNumber(msg.humidity);
  const previousTemp = asNumber(lastPersistedStatus.temp);

  if (temp !== null && temp >= TEMP_ALERT_HIGH) {
    writeAnomaly('temp_high', `Nhiệt độ cao bất thường: ${temp}°C`, { value: temp, threshold: TEMP_ALERT_HIGH });
  }
  if (temp !== null && previousTemp !== null && Math.abs(temp - previousTemp) >= TEMP_ALERT_DELTA) {
    writeAnomaly('temp_spike', `Nhiệt độ biến động đột ngột: ${previousTemp}°C → ${temp}°C`, { previous: previousTemp, value: temp, delta: Math.abs(temp - previousTemp) });
  }
  if (humidity !== null && humidity >= HUMIDITY_ALERT_HIGH) {
    writeAnomaly('humidity_high', `Độ ẩm cao bất thường: ${humidity}%`, { value: humidity, threshold: HUMIDITY_ALERT_HIGH });
  }
  if (humidity !== null && humidity <= HUMIDITY_ALERT_LOW) {
    writeAnomaly('humidity_low', `Độ ẩm thấp bất thường: ${humidity}%`, { value: humidity, threshold: HUMIDITY_ALERT_LOW });
  }
}

// ─── HANDLER: Event push từ ESP32 ────────────────────────────────────
function addDurationMetric(key, durationMs) {
  const minutes = Number(durationMs || 0) / 60000;
  if (minutes > 0) addDailyMetric(key, minutes);
}

function handleEventMsg(type, source, metadata = {}) {
  runtimeStats.events++;

  switch (type) {
    case 'open':
      runtimeStats.unlocks++;
      addDailyMetric('unlocks', 1);
      lastOpenSource = source;
      writeLocalEvent({
        type: 'access_success',
        source: source || 'esp32',
        target: 'mainDoor',
        message: `Mở cửa chính bởi ${sourceName(source)}`,
        dedupeKey: 'mainDoor:open',
        dedupeMs: 5000,
      });
      writePermLog('INFO', `Mo cua boi: ${sourceName(source)}`);
      break;
    case 'close': {
      const openedBy = lastOpenSource ? ` (da mo boi: ${sourceName(lastOpenSource)})` : '';
      addDurationMetric('doorOpenMinutes', metadata.durationMs);
      writeLocalEvent({
        type: 'device_duration',
        source: source || 'esp32',
        target: 'mainDoor',
        message: `Cửa chính đóng sau ${Math.round(Number(metadata.durationMs || 0) / 1000)}s`,
        metadata: { durationMs: Number(metadata.durationMs || 0), openedBy: lastOpenSource || null },
      });
      writePermLog('INFO', `Dong cua${openedBy}`);
      lastOpenSource = null;
      break;
    }
    case 'lockout': {
      runtimeStats.lockouts++;
      runtimeStats.alerts++;
      const sec = parseInt(source) || 30;
      lockoutSeconds = sec;
      addDailyMetric('lockouts', 1);
      writeLocalEvent({
        type: 'access_lockout',
        source: 'esp32',
        target: 'mainDoor',
        message: `Hệ thống bị khóa ${sec}s`,
        metadata: { seconds: sec },
      });
      writePermLog('WARN', `He thong bi khoa ${sec}s (qua so lan nhap sai)`);
      pushLog('LOCKOUT', `LOCKOUT:${sec}`);
      break;
    }
    case 'lockout_reset':
      lockoutSeconds = 30;
      writeTempLog('INFO', 'Lockout da duoc reset (mo cua thanh cong)');
      break;
    case 'warn_otp_expired':
      addDailyMetric('failedAccess', 1);
      writeLocalEvent({
        type: 'access_failed',
        source: source || 'esp32',
        target: 'mainDoor',
        message: `Có người thử dùng OTP hết hạn từ ${sourceName(source)}`,
        metadata: { reason: 'expired_otp' },
      });
      writePermLog('WARN', `Canh bao: Co nguoi thu dung OTP het han tu ${sourceName(source)}`);
      break;
    case 'access_failed':
      addDailyMetric('failedAccess', 1);
      writeLocalEvent({
        type: 'access_failed',
        source: source || 'esp32',
        target: metadata.target || 'mainDoor',
        message: `Truy cập bị từ chối bởi ${sourceName(source)}`,
        metadata: { reason: metadata.reason || null },
        dedupeKey: `access_failed:${metadata.target || 'mainDoor'}:${source || 'esp32'}`,
        dedupeMs: 5000,
      });
      writePermLog('WARN', `Truy cap bi tu choi: ${sourceName(source)}`);
      break;
    case 'motion':
      runtimeStats.motionEvents++;
      writeTempLog('INFO', `Phat hien chuyen dong (${source})`);
      break;
    case 'gara':
      runtimeStats.garageEvents++;
      addDailyMetric('garageEvents', 1);
      writeLocalEvent({
        type: 'access_success',
        source: source || 'ultrasonic',
        target: 'garageDoor',
        message: `Mở gara bởi ${sourceName(source)}`,
        dedupeKey: 'garageDoor:open',
        dedupeMs: 5000,
      });
      writePermLog('INFO', `Cong gara mo - phat hien boi: ${sourceName(source)}`);
      break;
    case 'gara_close':
      addDurationMetric('garageOpenMinutes', metadata.durationMs);
      writeLocalEvent({
        type: 'device_duration',
        source: source || 'esp32',
        target: 'garageDoor',
        message: `Gara đóng sau ${Math.round(Number(metadata.durationMs || 0) / 1000)}s`,
        metadata: { durationMs: Number(metadata.durationMs || 0) },
      });
      break;
    case 'fan_off':
      addDurationMetric('fanOnMinutes', metadata.durationMs);
      writeLocalEvent({
        type: 'device_duration',
        source: 'esp32',
        target: 'environmentFan',
        message: `Quạt tắt sau ${Math.round(Number(metadata.durationMs || 0) / 1000)}s`,
        metadata: { durationMs: Number(metadata.durationMs || 0), reason: source || null },
      });
      break;
    case 'door_fastclose':
      writeTempLog('INFO', 'Fast-close: xe/nguoi da di qua, dong cua sau 1s');
      break;
    case 'fan':
      runtimeStats.fanEvents++;
      writeTempLog('INFO', `Quat tu dong: ${source}`);
      break;
    default:
      writeTempLog('INFO', `Event khong xac dinh: type=${type} source=${source}`);
  }

  // Với local stats, ghi ngay sau event thật để các thẻ thống kê/chart cập nhật nhanh hơn.
  writeLocalDailyStats(ensureDailyAccumulator());
}

// ─── HELPER: gửi lệnh + xử lý lỗi chuẩn ─────────────────────────────
async function routeCmd(res, cmd, payload = null, logPrefix = null) {
  if (logPrefix) writeTempLog('INFO', `${logPrefix}: cmd=${cmd} payload=${payload || ''}`);
  runtimeStats.commands++;
  try {
    const result = await sendCmd(cmd, payload);
    res.send(result);
  } catch (e) {
    runtimeStats.failedCommands++;
    const code = e.message === 'ESP32_OFFLINE' || e.message === 'ESP32_DISCONNECTED'
      ? 503
      : e.message === 'WS_TIMEOUT'
        ? 504
        : 502;
    writeTempLog('ERROR', `Cmd ${cmd} that bai: ${e.message}`);
    res.status(code).send(e.message);
  }
}

// ─── ROUTES ──────────────────────────────────────────────────────────

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'USERNAME_PASSWORD_REQUIRED' });
  }

  try {
    const user = await findWebUser(username);
    if (!user || user.enabled === false || !user.passwordHash || !String(user.passwordHash).startsWith('$2')) {
      writeLocalEvent({
        type: 'web_login_failed',
        source: String(username),
        message: 'Web login failed: user not found or disabled',
      });
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      writeLocalEvent({
        type: 'web_login_failed',
        source: String(username),
        message: 'Web login failed: wrong password',
      });
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }

    const token = signUser(user);
    setFirestoreDoc(`webUsers/${user.id}`, { lastLoginAtIso: nowIso() });
    res.json({
      token,
      user: {
        userId: user.userId || user.id,
        username: user.username || user.id,
        displayName: user.displayName || user.username || user.id,
        role: user.role || 'viewer',
      },
    });
  } catch (e) {
    writeTempLog('ERROR', `Login error: ${e.message}`);
    res.status(500).json({ error: 'LOGIN_FAILED' });
  }
});

app.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.post('/auth/change-password', requireAuth, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (newPassword.length < 8 || newPassword.length > 64) {
    return res.status(400).json({ error: 'PASSWORD_LENGTH_INVALID' });
  }
  try {
    const user = await findWebUser(req.user.username || req.user.sub);
    if (!user?.passwordHash || !String(user.passwordHash).startsWith('$2')) {
      return res.status(401).json({ error: 'INVALID_CURRENT_PASSWORD' });
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'INVALID_CURRENT_PASSWORD' });
    await db.collection('webUsers').doc(user.id).set({
      passwordHash: await bcrypt.hash(newPassword, 12),
      passwordHashAlgo: 'bcrypt',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAtIso: nowIso(),
    }, { merge: true });
    writeLocalEvent({
      type: 'web_password_changed',
      source: req.user.username || req.user.sub,
      target: 'webUsers',
      message: 'Đổi mật khẩu web app',
    });
    res.json({ ok: true });
  } catch (e) {
    writeTempLog('ERROR', `Change password error: ${e.message}`);
    res.status(500).json({ error: 'CHANGE_PASSWORD_FAILED' });
  }
});

// Fallback event endpoint nếu cần ghi event từ client HTTP nội bộ.
app.post('/event', (req, res) => {
  const { type, source } = req.body;
  handleEventMsg(type, source);
  res.send('OK');
});

async function handleCommandRoute(req, res) {
  const { method = 'POST', path: commandPath, cmd: directCmd, payload } = req.body;
  const cmd = (directCmd || commandPath || '').replace(/^\/+/, '');
  if (!cmd) return res.status(400).json({ error: 'MISSING_COMMAND' });

  if (cmd === 'open') {
    writePermLog('INFO', `Lenh mo cua → ESP32 | payload: ${payload || 'none'}`);
  } else if (cmd !== 'status') {
    writeTempLog('INFO', `Relay cmd: ${method} ${cmd} payload=${payload || ''}`);
  }

  try {
    const result = await sendCmd(cmd, payload || null);
    if (cmd === 'open') writePermLog('INFO', `Ket qua mo cua: "${result}"`);
    res.send(result);
  } catch (e) {
    const code = e.message === 'ESP32_OFFLINE' || e.message === 'ESP32_DISCONNECTED'
      ? 503
      : e.message === 'WS_TIMEOUT'
        ? 504
        : 502;
    writeTempLog(code === 504 ? 'WARN' : 'ERROR', `WS command ${cmd}: ${e.message}`);
    res.status(code).send(
      e.message === 'ESP32_DISCONNECTED' ? 'ESP32_OFFLINE' : e.message
    );
  }
}

app.post('/command', requireAuth, handleCommandRoute);
app.post('/coap', requireAuth, handleCommandRoute);

// ── MỚI: Sensor data cache (không cần secret — đọc-only) ─────────────
app.get('/sensor', requireAuth, (req, res) => {
  if (!Object.keys(lastStatus).length) {
    return res.status(503).json({ error: 'ESP32 chua ket noi hoac chua push status' });
  }
  if (!esp32Online()) {
    return res.status(503).json({
      error: esp32SocketOpen() ? 'ESP32_STATUS_STALE' : 'ESP32_OFFLINE',
      connected: false,
      socketOpen: esp32SocketOpen(),
      lastSeen: lastStatus.time || null,
      lastSeenMs: lastStatusAtMs || null,
    });
  }
  res.json({ ...lastStatus, connected: true, socketOpen: true, stale: false });
});

// ── MỚI: Trạng thái kết nối ESP32 ────────────────────────────────────
app.get('/esp32-status', requireAuth, (req, res) => {
  res.json({
    connected: esp32Online(),
    socketOpen: esp32SocketOpen(),
    stale: esp32SocketOpen() && !esp32StatusFresh(),
    lastSeen:  lastStatus.time || null,
    door:      lastStatus.door || null,
    temp:      lastStatus.temp ?? null,
    humidity:  lastStatus.humidity ?? null,
    motion:    lastStatus.motion ?? null,
    gara:      lastStatus.gara || null,
    garageMode: lastStatus.garageMode || null,
    fan:       lastStatus.fan || null,
    fanPct:    lastStatus.fanPct ?? null,
    fanMode:   lastStatus.fanMode || null,
    light:     lastStatus.light ?? null,
    lightMode: lastStatus.lightMode || null,
    lightBrightness: lastStatus.lightBrightness ?? null,
    lightEffect: lastStatus.lightEffect || null,
    lightHold: lastStatus.lightHold ?? null,
    autoCloseSeconds: lastStatus.autoCloseSeconds ?? null,
    doorRemainingSeconds: lastStatus.doorRemainingSeconds ?? null,
    garaRemainingSeconds: lastStatus.garaRemainingSeconds ?? null,
    dist:      lastStatus.dist ?? null,
  });
});

app.get('/stats', requireAuth, (req, res) => {
  const now = Date.now();
  const lightMs = usageTracker.lightOnMs + (usageTracker.lightOnSince ? now - usageTracker.lightOnSince : 0);
  const fanMs = usageTracker.fanOnMs + (usageTracker.fanOnSince ? now - usageTracker.fanOnSince : 0);
  res.json({
    ...runtimeStats,
    lightOnMinutesToday: Math.round(lightMs / 60000),
    fanOnMinutesToday: Math.round(fanMs / 60000),
    failedAccess: dailyAccumulator?.failedAccess || 0,
    uptimeSec: Math.floor(process.uptime()),
    esp32Connected: esp32Online(),
    esp32SocketOpen: esp32SocketOpen(),
    esp32StatusStale: esp32SocketOpen() && !esp32StatusFresh(),
    lastStatusAt: lastStatus.time || null,
    current: lastStatus,
  });
});

app.get('/events', requireAuth, async (req, res) => {
  const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 80));
  const date = String(req.query.date || '').trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'INVALID_DATE' });
  }
  res.json(readLocalEvents(limit, 30, date));
});

app.get('/daily-stats', requireAuth, async (req, res) => {
  const days = Math.max(1, Math.min(30, parseInt(req.query.days, 10) || 7));
  const dateId = String(req.query.date || '').trim();
  if (dateId) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateId)) return res.status(400).json({ error: 'INVALID_DATE' });
    const row = readLocalDailyStat(dateId);
    return res.json(row ? [normalizeDailyStatForApi(row)] : []);
  }
  const rows = dateIdsForLastLocal(days)
    .map(date => readLocalDailyStat(date))
    .filter(Boolean)
    .map(normalizeDailyStatForApi);
  res.json(rows);
});

function normalizeDailyStatForApi(row) {
  row = applyStatAnomalyRules(row || {});
  const hourly = row.hourly || {};
  const normalizedHourly = {};
  for (let h = 0; h < 24; h++) {
    const key = String(h).padStart(2, '0');
    const bucket = hourly[key] || {};
    normalizedHourly[key] = {
      ...bucket,
      avgTemperature: bucket.tempCount
        ? Math.round((Number(bucket.tempSum || 0) / Number(bucket.tempCount)) * 10) / 10
        : (bucket.avgTemperature ?? null),
      avgHumidity: bucket.humidityCount
        ? Math.round((Number(bucket.humiditySum || 0) / Number(bucket.humidityCount)) * 10) / 10
        : (bucket.avgHumidity ?? null),
      lightOnMinutes: Math.round(Number(bucket.lightOnMinutes || 0)),
      fanOnMinutes: Math.round(Number(bucket.fanOnMinutes || 0)),
      anomalies: Number(bucket.anomalies || 0),
      anomalyTags: Array.isArray(bucket.anomalyTags) ? bucket.anomalyTags : [],
      failedAccess: Number(bucket.failedAccess || 0),
      lockouts: Number(bucket.lockouts || 0),
      unlocks: Number(bucket.unlocks || 0),
      garageEvents: Number(bucket.garageEvents || 0),
    };
  }
  return { ...row, hourly: normalizedHourly };
}


function accessStatusForApi(record = {}) {
  if (record.enabled === false) return 'disabled';
  if (isExpired(record)) return 'expired';
  return accessAllowed(record).ok ? 'active' : 'limited';
}

app.get('/access/cards', requireAuth, async (req, res) => {
  const snap = await db.collection('accessCards').orderBy('updatedAt', 'desc').limit(200).get();
  res.json(snap.docs.map(doc => {
    const data = doc.data();
    return { id: doc.id, ...data, status: accessStatusForApi(data) };
  }));
});

app.post('/access/cards', requireAuth, async (req, res) => {
  const body = req.body || {};
  const uid = normalizeUid(body.uid);
  if (!uid) return res.status(400).json({ error: 'UID_REQUIRED' });
  const target = body.target === 'garageDoor' ? 'garageDoor' : 'mainDoor';
  let policy;
  try { policy = normalizeAccessPolicy(body); }
  catch (e) { return res.status(400).json({ error: e.message }); }
  const data = {
    uid,
    name: String(body.name || `Thẻ ${uid}`).trim(),
    target,
    enabled: parseBool(body.enabled, true),
    ...policy,
    createdBy: req.user.username || req.user.sub,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtIso: nowIso(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAtIso: nowIso(),
  };
  const ref = await db.collection('accessCards').add(data);
  writeLocalEvent({ type: 'access_card_created', source: 'web_app', target, message: `Tạo thẻ ${data.name}` });
  pushEsp32ConfigSync();
  res.status(201).json({ id: ref.id, ...data });
});

app.patch('/access/cards/:id', requireAuth, async (req, res) => {
  const patch = {};
  const body = req.body || {};
  const currentDoc = await db.collection('accessCards').doc(req.params.id).get();
  const current = currentDoc.exists ? currentDoc.data() : {};
  if (body.uid !== undefined) patch.uid = normalizeUid(body.uid);
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.target !== undefined) patch.target = body.target === 'garageDoor' ? 'garageDoor' : 'mainDoor';
  if (body.enabled !== undefined) patch.enabled = parseBool(body.enabled, true);
  if (
    body.accessType !== undefined || body.timeWindow !== undefined ||
    body.dateRange !== undefined || body.expiresAtIso !== undefined ||
    body.relativeMinutes !== undefined
  ) {
    try { Object.assign(patch, normalizeAccessPolicy(body, current)); }
    catch (e) { return res.status(400).json({ error: e.message }); }
  }
  patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  patch.updatedAtIso = nowIso();
  await db.collection('accessCards').doc(req.params.id).set(patch, { merge: true });
  pushEsp32ConfigSync();
  res.json({ id: req.params.id, ...patch });
});

app.delete('/access/cards/:id', requireAuth, async (req, res) => {
  await db.collection('accessCards').doc(req.params.id).delete();
  writeLocalEvent({ type: 'access_card_deleted', source: 'web_app', target: 'rfid', message: `Xóa thẻ ${req.params.id}` });
  pushEsp32ConfigSync();
  res.json({ ok: true });
});

app.post('/access/cards/enroll', requireAuth, (req, res) => {
  let policy;
  try { policy = normalizeAccessPolicy(req.body || {}); }
  catch (e) { return res.status(400).json({ error: e.message }); }
  rfidEnrollment = {
    target: req.body?.target === 'garageDoor' ? 'garageDoor' : 'mainDoor',
    name: String(req.body?.name || '').trim(),
    user: req.user.username || req.user.sub,
    ...policy,
    expiresAt: Date.now() + 60000,
  };
  res.json({ ok: true, expiresInSeconds: 60 });
});

app.get('/access/passwords', requireAuth, async (req, res) => {
  const snap = await db.collection('accessPasswords').orderBy('updatedAt', 'desc').limit(200).get();
  res.json(snap.docs.map(doc => {
    const data = doc.data();
    delete data.passwordHash;
    delete data.pinPlain;
    return { id: doc.id, ...data, status: accessStatusForApi(data) };
  }));
});

async function passwordExistsForAccess(password, excludeId = null) {
  const raw = String(password || '');
  if (!raw) return false;
  const snap = await runFirestoreRead('read:passwordDuplicate', () =>
    db.collection('accessPasswords').limit(300).get(),
    null
  );
  if (!snap) return false;
  for (const doc of snap.docs) {
    if (excludeId && doc.id === excludeId) continue;
    const data = doc.data();
    if (data.pinPlain && String(data.pinPlain) === raw) return true;
    if (data.passwordHash && String(data.passwordHash).startsWith('$2')) {
      try {
        if (await bcrypt.compare(raw, data.passwordHash)) return true;
      } catch {}
    }
  }
  return false;
}

app.post('/access/passwords', requireAuth, async (req, res) => {
  const body = req.body || {};
  const password = String(body.password || '');
  if (password.length < 4 || password.length > 16) return res.status(400).json({ error: 'PASSWORD_LENGTH_INVALID' });
  if (await passwordExistsForAccess(password)) return res.status(409).json({ error: 'PASSWORD_DUPLICATED' });
  const type = body.type === 'master' ? 'master' : (body.type || 'temporary');
  if (type === 'master') {
    const currentMaster = await runFirestoreRead('read:currentMasterPassword', () =>
      db.collection('accessPasswords').where('type', '==', 'master').limit(1).get(), null);
    if (currentMaster && !currentMaster.empty) return res.status(409).json({ error: 'MASTER_PASSWORD_EXISTS' });
  }
  let policy;
  try {
    policy = normalizeAccessPolicy({
      ...body,
      accessType: type === 'master' ? 'full_time' : (body.accessType || 'full_time'),
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const data = {
    name: String(body.name || 'Mật khẩu tạm').trim(),
    type,
    target: 'mainDoor',
    enabled: parseBool(body.enabled, true),
    ...policy,
    autoDeleteWhenExpired: type !== 'master',
    passwordHash: await bcrypt.hash(password, 12),
    passwordHashAlgo: 'bcrypt',
    pinPlain: password, // dùng để sync cache local cho ESP32 trong mô hình; không trả về API
    createdBy: req.user.username || req.user.sub,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtIso: nowIso(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAtIso: nowIso(),
  };
  const ref = await db.collection('accessPasswords').add(data);
  writeLocalEvent({ type: 'access_password_created', source: 'web_app', target: 'mainDoor', message: `Tạo mật khẩu ${data.name}` });
  delete data.passwordHash;
  delete data.pinPlain;
  pushEsp32ConfigSync();
  res.status(201).json({ id: ref.id, ...data, status: 'active' });
});

app.patch('/access/passwords/:id', requireAuth, async (req, res) => {
  const body = req.body || {};
  const patch = {};
  const ref = db.collection('accessPasswords').doc(req.params.id);
  const doc = await ref.get();
  const current = doc.exists ? doc.data() : {};
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.type !== undefined && current.type !== 'master') patch.type = body.type === 'guest' ? 'guest' : 'temporary';
  if (
    body.accessType !== undefined || body.timeWindow !== undefined ||
    body.dateRange !== undefined || body.expiresAtIso !== undefined ||
    body.relativeMinutes !== undefined
  ) {
    try {
      Object.assign(patch, normalizeAccessPolicy(
        { ...body, accessType: current.type === 'master' ? 'full_time' : body.accessType },
        current
      ));
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }
  if (body.enabled !== undefined) patch.enabled = parseBool(body.enabled, true);
  if (body.password !== undefined && String(body.password).length > 0) {
    const newPassword = String(body.password);
    if (newPassword.length < 4 || newPassword.length > 16) {
      return res.status(400).json({ error: 'PASSWORD_LENGTH_INVALID' });
    }
    if (await passwordExistsForAccess(newPassword, req.params.id)) {
      return res.status(409).json({ error: 'PASSWORD_DUPLICATED' });
    }
    patch.passwordHash = await bcrypt.hash(newPassword, 12);
    patch.passwordHashAlgo = 'bcrypt';
    patch.pinPlain = newPassword;
  }
  patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  patch.updatedAtIso = nowIso();
  await db.collection('accessPasswords').doc(req.params.id).set(patch, { merge: true });
  delete patch.passwordHash;
  delete patch.pinPlain;
  pushEsp32ConfigSync();
  res.json({ id: req.params.id, ...patch });
});

app.delete('/access/passwords/:id', requireAuth, async (req, res) => {
  const ref = db.collection('accessPasswords').doc(req.params.id);
  const doc = await ref.get();
  if (doc.exists && doc.data().type === 'master') return res.status(409).json({ error: 'CANNOT_DELETE_MASTER' });
  await ref.delete();
  pushEsp32ConfigSync();
  res.json({ ok: true });
});

app.post('/settings/device', requireAuth, async (req, res) => {
  const { deviceId, settings = {} } = req.body || {};
  const allowed = ['mainDoor', 'garageDoor', 'hallwayLight', 'environmentFan'];
  if (!allowed.includes(deviceId)) return res.status(400).json({ error: 'INVALID_DEVICE_ID' });
  setFirestoreDoc(`devices/${deviceId}`, settings);
  pushEsp32ConfigSync();
  res.json({ ok: true });
});

app.post('/settings/auto-close', requireAuth, async (req, res) => {
  const seconds = Math.max(1, Math.min(600, parseInt(req.body?.seconds, 10) || 30));

  // Ưu tiên ESP32: cập nhật RAM trước, gửi lệnh duration trước, Firestore ghi nền sau.
  configOverrides.autoCloseSeconds = seconds;
  saveLocalConfigCache();
  patchLastEsp32Config({
    autoCloseSeconds: seconds,
    doorOpenSeconds: seconds,
    garageCloseSeconds: seconds,
  });

  const ok = await sendCommandResponse(res, 'duration', `${seconds}`, 'auto_close');
  if (!ok) return;

  setFirestoreDoc('systemSettings/main', { autoCloseSeconds: seconds });
  setFirestoreDoc('devices/mainDoor', { autoCloseSeconds: seconds });
  setFirestoreDoc('devices/garageDoor', { autoCloseSeconds: seconds });

  // Sync nền để ESP32 cache đúng config mới, không dùng giá trị Firestore cũ.
  pushEsp32ConfigSync();
});

// ── MỚI: Điều khiển cổng gara ─────────────────────────────────────────
//   POST /gara   { action: "open" | "close" }
app.post('/gara', requireAuth, (req, res) => {
  const { action } = req.body;
  if (!['open', 'close'].includes(action)) {
    return res.status(400).json({ error: 'action phai la "open" hoac "close"' });
  }
  const cmd = action === 'open' ? 'gara_open' : 'gara_close';
  writePermLog('INFO', `Web lenh ${action === 'open' ? 'MO' : 'DONG'} cong gara`);
  routeCmd(res, cmd, null, 'gara');
});

// ── MỚI: Điều khiển quạt ─────────────────────────────────────────────
//   POST /fan   { mode: "auto"|"on"|"manual"|"off", dir: 1|-1|0, speed: 0-100 }
app.post('/fan', requireAuth, (req, res) => {
  const { mode, dir = 0, speed = 0 } = req.body;
  let cmd, payload;

  const normalizedMode = String(mode || '').toLowerCase();
  const requestedSpeed = boundedPercent(speed, 60);

  if (normalizedMode === 'auto') {
    // Tự động chỉ quyết định bật/tắt và hướng quay theo ngưỡng.
    // Tốc độ PWM vẫn dùng tốc độ người dùng chỉnh trên dashboard.
    cmd     = 'fan_auto';
    payload = String(requestedSpeed);
    configOverrides.fan = { ...(configOverrides.fan || {}), autoSpeed: requestedSpeed };
    saveLocalConfigCache();
    patchLastEsp32Config({ fan: configOverrides.fan });
    writeTempLog('INFO', `Web: bat quat che do tu dong speed=${requestedSpeed}%`);
  } else if (normalizedMode === 'off' || ((normalizedMode === 'manual' || normalizedMode === 'on') && parseInt(speed) === 0)) {
    cmd     = 'fan_set';
    payload = '0:0';
    writeTempLog('INFO', 'Web: tat quat');
  } else {
    // on/manual: dir = 1 (thuan) | -1 (nguoc), speed = 0-100%
    const parsedDir = parseInt(dir, 10);
    const d = parsedDir === -1 ? -1 : 1;
    const s = boundedPercent(speed, 50);
    cmd     = 'fan_set';
    payload = `${d}:${s}`;
    writeTempLog('INFO', `Web: dat quat bat dir=${d} speed=${s}%`);
  }
  routeCmd(res, cmd, payload, 'fan');
});

// ── MỚI: Điều khiển đèn hành lang ────────────────────────────────────
//   POST /light   { state: "on" | "off" | "auto" }
app.post('/light', requireAuth, (req, res) => {
  const { state } = req.body;
  const cmdMap = { on: 'light_on', off: 'light_off', auto: 'light_auto' };
  const cmd = cmdMap[state];
  if (!cmd) return res.status(400).json({ error: 'state phai la "on", "off", hoac "auto"' });
  writeTempLog('INFO', `Web: den hanh lang → ${state}`);
  routeCmd(res, cmd, null, 'light');
});

app.post('/light/settings', requireAuth, async (req, res) => {
  const hold = Math.max(1, Math.min(600, parseInt(req.body?.holdSeconds, 10) || 20));
  const brightness = Math.max(10, Math.min(100, parseInt(req.body?.brightness, 10) || 70));
  const rawEffect = String(req.body?.effect || 'static').toLowerCase();
  const effect = ['static', 'blink', 'fading'].includes(rawEffect) ? rawEffect : 'static';

  configOverrides.light = { holdSeconds: hold, brightness, effect };
  saveLocalConfigCache();
  patchLastEsp32Config({ light: configOverrides.light });

  const ok = await sendCommandResponse(res, 'light_config', `${hold}:${brightness}:${effect}`, 'light_config');
  if (!ok) return;

  setFirestoreDoc('devices/hallwayLight', {
    minOnSeconds: hold,
    maxBrightness: brightness,
    effect,
  });
  pushEsp32ConfigSync();
});

app.post('/fan/settings', requireAuth, async (req, res) => {
  const tempOn = Number(req.body?.temperatureOnThreshold ?? 35);
  const tempOff = Number(req.body?.temperatureOffThreshold ?? 33);
  const humOn = Number(req.body?.humidityOnThreshold ?? 40);
  const humOff = Number(req.body?.humidityOffThreshold ?? 45);
  const autoSpeed = boundedPercent(req.body?.speed ?? req.body?.fanSpeed ?? configOverrides.fan?.autoSpeed, 60);
  if (!(tempOff < tempOn) || !(humOff > humOn)) {
    return res.status(400).json({ error: 'TEMP_OFF_LOWER_THAN_TEMP_ON_AND_HUM_OFF_GREATER_THAN_HUM_ON_REQUIRED' });
  }

  configOverrides.fan = { tempOn, tempOff, humOn, humOff, autoSpeed };
  saveLocalConfigCache();
  patchLastEsp32Config({ fan: configOverrides.fan });

  // Gửi trực tiếp xuống ESP32 trước để quạt phản ánh ngay, không chờ Firestore/config sync.
  // Tham số thứ 5 là tốc độ cố định cho chế độ tự động.
  const ok = await sendCommandResponse(res, 'fan_config', `${tempOn}:${tempOff}:${humOn}:${humOff}:${autoSpeed}`, 'fan_config');
  if (!ok) return;

  setFirestoreDoc('devices/environmentFan', {
    temperatureOnThreshold: tempOn,
    temperatureOffThreshold: tempOff,
    humidityOnThreshold: humOn,
    humidityOffThreshold: humOff,
    autoSpeedPct: autoSpeed,
  });
  pushEsp32ConfigSync();
});

// Nạp sẵn daily stats hôm nay khi server khởi động để tránh ghi đè thống kê cũ sau restart.
ensureDailyAccumulator(getDate());

// ─── KHỞI ĐỘNG ───────────────────────────────────────────────────────
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    writeTempLog('ERROR', `Port ${PORT} dang duoc su dung. Dung process cu hoac chay PORT=3001 npm start.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  writeTempLog('INFO', '=== Smart Home Gateway V4.0 ===');
  writeTempLog('INFO', `HTTP/REST/SSE : http://localhost:${PORT}`);
  writeTempLog('INFO', `WebSocket ESP32: ws://localhost:${PORT}/ws/esp32`);
  for (const ip of getLanAddresses()) {
    writeTempLog('INFO', `LAN Dashboard : http://${ip}:${PORT}`);
    writeTempLog('INFO', `LAN ESP32 WS  : ws://${ip}:${PORT}/ws/esp32`);
  }
  writeTempLog('INFO', 'New endpoints: GET /sensor, POST /gara, POST /fan, POST /light');
});

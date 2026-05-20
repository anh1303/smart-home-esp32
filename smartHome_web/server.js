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
const PORT = parseInt(process.env.PORT, 10) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'smart-home-dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

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

function writeFirestore(collection, data) {
  db.collection(collection).add({
    ...data,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtIso: nowIso(),
  }).catch(err => writeTempLog('ERROR', `Firestore ${collection}: ${err.message}`));
}

function setFirestoreDoc(pathName, data) {
  db.doc(pathName).set({
    ...data,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAtIso: nowIso(),
  }, { merge: true }).catch(err => writeTempLog('ERROR', `Firestore ${pathName}: ${err.message}`));
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
let lastOpenSource = null;
let lockoutSeconds = 30;

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
let   lastServerCommandAt = 0;
const SERVER_COMMAND_INTERVAL_MS = 500;
const FIRESTORE_STATE_INTERVAL_MS = 10000;
const DAILY_STATS_INTERVAL_MS = 60000;
const TEMP_ALERT_HIGH = Number(process.env.TEMP_ALERT_HIGH || 38);
const TEMP_ALERT_DELTA = Number(process.env.TEMP_ALERT_DELTA || 5);
const HUMIDITY_ALERT_HIGH = Number(process.env.HUMIDITY_ALERT_HIGH || 85);
const HUMIDITY_ALERT_LOW = Number(process.env.HUMIDITY_ALERT_LOW || 25);
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
      handleEventMsg(msg.event, msg.source);
      return;
    }

    if (msg.type === 'auth_request') {
      handleAuthRequest(msg);
      return;
    }
  });

  ws.on('close', () => {
    if (esp32Ws === ws) esp32Ws = null;
    writePermLog('WARN', 'ESP32 ngat ket noi WebSocket');
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

function ensureDailyAccumulator(date = getDate()) {
  if (!dailyAccumulator || dailyAccumulator.date !== date) {
    dailyAccumulator = createDailyAccumulator(date);
    usageTracker.day = date;
    usageTracker.lightOnSince = null;
    usageTracker.fanOnSince = null;
    usageTracker.lightOnMs = 0;
    usageTracker.fanOnMs = 0;
    usageTracker.lastUsageAt = Date.now();
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

  return {
    ...acc,
    avgTemperature: tempCount ? Math.round((tempSum / tempCount) * 10) / 10 : acc.lastTemperature,
    avgHumidity: humidityCount ? Math.round((humiditySum / humidityCount) * 10) / 10 : acc.lastHumidity,
    minTemperature: minTemp,
    maxTemperature: maxTemp,
    minHumidity,
    maxHumidity,
  };
}

function addDailyMetric(key, amount = 1, date = getDate(), hour = localDateParts().hour) {
  const acc = ensureDailyAccumulator(date);
  const bucket = acc.hourly[hour] || (acc.hourly[hour] = emptyHourBucket());
  acc[key] = (acc[key] || 0) + amount;
  bucket[key] = (bucket[key] || 0) + amount;
}

function writeAnomaly(type, message, metadata = {}) {
  const now = Date.now();
  if (lastAnomalyAt[type] && now - lastAnomalyAt[type] < 10 * 60 * 1000) return;
  lastAnomalyAt[type] = now;
  addDailyMetric('anomalies', 1);
  writeFirestore('events', {
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
  ]);
}

function persistStatusToFirestore(msg, dailyStats) {
  const now = Date.now();

  if (shouldPersistState(msg, now)) {
    setFirestoreDoc('devices/esp32', {
      online: true,
      lastSeenAtIso: nowIso(),
      lastStatus,
    });
    setFirestoreDoc('systemState/current', {
      door: msg.door || null,
      temp: msg.temp ?? null,
      humidity: msg.humidity ?? null,
      motion: msg.motion ?? null,
      gara: msg.gara || null,
      garageMode: msg.garageMode || null,
      fan: msg.fan || null,
      fanPct: msg.fanPct ?? null,
      fanMode: msg.fanMode || null,
      light: msg.light ?? null,
      lightMode: msg.lightMode || null,
      lightBrightness: msg.lightBrightness ?? null,
      lightEffect: msg.lightEffect || null,
      lightHold: msg.lightHold ?? null,
      dist: msg.dist ?? null,
    });
    lastFirestoreStateAt = now;
    lastPersistedStatus = { ...msg };
  }

  if (!lastDailyStatsAt || now - lastDailyStatsAt >= DAILY_STATS_INTERVAL_MS) {
    setFirestoreDoc(`dailyStats/${dailyStats.date}`, finalizeDailyStats(dailyStats));
    lastDailyStatsAt = now;
  }
}

async function validateRfidCredential(uid, target) {
  const normalizedUid = normalizeUid(uid);
  if (!normalizedUid) return { ok: false, reason: 'empty_uid' };

  const snap = await db.collection('accessCards').where('uid', '==', normalizedUid).limit(5).get();

  if (snap.empty) return { ok: false, reason: 'card_not_found' };
  const doc = target === 'any' ? snap.docs[0] : snap.docs.find(item => item.data().target === target);
  if (!doc) return { ok: false, reason: 'card_target_mismatch' };
  const record = { id: doc.id, ...doc.data() };
  return { ...accessAllowed(record), record };
}

async function validatePasswordCredential(pin, target) {
  const rawPin = String(pin || '');
  if (rawPin.length < 4) return { ok: false, reason: 'pin_too_short' };

  const snap = await db.collection('accessPasswords')
    .where('target', '==', target)
    .get();

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

  const exists = await db.collection('accessCards').where('uid', '==', normalizedUid).limit(1).get();
  if (!exists.empty) return { enrolled: false, reason: 'card_exists' };

  const card = {
    uid: normalizedUid,
    name: rfidEnrollment.name || `Thẻ ${normalizedUid}`,
    target: rfidEnrollment.target || target || 'mainDoor',
    enabled: true,
    accessType: 'full_time',
    timeWindow: null,
    dateRange: null,
    enrolledBy: rfidEnrollment.user || 'web',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtIso: nowIso(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAtIso: nowIso(),
  };
  const ref = await db.collection('accessCards').add(card);
  rfidEnrollment = null;
  writeFirestore('events', {
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
    addDailyMetric(allowed ? 'unlocks' : 'failedAccess', 1);

    writeFirestore('events', {
      type: allowed ? 'access_success' : 'access_failed',
      source: method,
      target: resolvedTarget,
      message: allowed
        ? `Truy cập hợp lệ: ${result.record?.name || source}`
        : `Truy cập bị từ chối: ${result.reason || 'unknown'}`,
      metadata: { reason: result.reason || null, uid: method === 'rfid' ? normalizeUid(credential) : null },
    });

    if (allowed && result.record?.autoDeleteWhenExpired && result.record.type !== 'master' && isExpired(result.record)) {
      db.collection('accessPasswords').doc(result.record.id).delete().catch(() => {});
    }

    sendWsJson({
      type: 'auth_result',
      requestId,
      allowed,
      target: resolvedTarget,
      source,
      seconds: result.record?.autoCloseSeconds || 30,
      reason: result.reason || null,
    });
  } catch (e) {
    writeTempLog('ERROR', `Auth request failed: ${e.message}`);
    sendWsJson({ type: 'auth_result', requestId, allowed: false, reason: 'server_error' });
  }
}

// ─── HANDLER: Status push từ ESP32 ───────────────────────────────────
function handleStatusPush(msg) {
  lastStatus = { ...msg, time: getTime() };
  delete lastStatus.type;
  runtimeStats.statusUpdates++;
  const dailyStats = updateUsageStats(msg);
  detectRealtimeAnomalies(msg);
  persistStatusToFirestore(msg, dailyStats);

  const newState = (msg.door || '').toUpperCase();

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
function handleEventMsg(type, source) {
  runtimeStats.events++;

  switch (type) {
    case 'open':
      runtimeStats.unlocks++;
      lastOpenSource = source;
      writePermLog('INFO', `Mo cua boi: ${sourceName(source)}`);
      break;
    case 'close': {
      const openedBy = lastOpenSource ? ` (da mo boi: ${sourceName(lastOpenSource)})` : '';
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
      writeFirestore('events', {
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
      writePermLog('WARN', `Canh bao: Co nguoi thu dung OTP het han tu ${sourceName(source)}`);
      break;
    case 'motion':
      runtimeStats.motionEvents++;
      writeTempLog('INFO', `Phat hien chuyen dong (${source})`);
      break;
    case 'gara':
      runtimeStats.garageEvents++;
      addDailyMetric('garageEvents', 1);
      writeFirestore('events', {
        type: 'device_state_changed',
        source: source || 'ultrasonic',
        target: 'garageDoor',
        message: `Cổng gara mở bởi ${sourceName(source)}`,
      });
      writePermLog('INFO', `Cong gara mo - phat hien boi: ${sourceName(source)}`);
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
      writeFirestore('events', {
        type: 'web_login_failed',
        source: String(username),
        message: 'Web login failed: user not found or disabled',
      });
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      writeFirestore('events', {
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
  res.json(lastStatus);
});

// ── MỚI: Trạng thái kết nối ESP32 ────────────────────────────────────
app.get('/esp32-status', requireAuth, (req, res) => {
  res.json({
    connected: !!(esp32Ws && esp32Ws.readyState === WebSocket.OPEN),
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
    esp32Connected: !!(esp32Ws && esp32Ws.readyState === WebSocket.OPEN),
    lastStatusAt: lastStatus.time || null,
    current: lastStatus,
  });
});

app.get('/events', requireAuth, async (req, res) => {
  const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 80));
  try {
    const snap = await db.collection('events').orderBy('createdAt', 'desc').limit(limit).get();
    res.json(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  } catch (e) {
    res.status(500).json({ error: 'EVENTS_READ_FAILED' });
  }
});

app.get('/daily-stats', requireAuth, async (req, res) => {
  const days = Math.max(1, Math.min(30, parseInt(req.query.days, 10) || 7));
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - days + 1);
  const startId = start.toISOString().slice(0, 10);
  try {
    const snap = await db.collection('dailyStats')
      .where('date', '>=', startId)
      .orderBy('date', 'asc')
      .limit(days)
      .get();
    res.json(snap.docs.map(doc => normalizeDailyStatForApi({ id: doc.id, ...doc.data() })));
  } catch (e) {
    res.status(500).json({ error: 'DAILY_STATS_READ_FAILED' });
  }
});

function normalizeDailyStatForApi(row) {
  const hourly = row.hourly || {};
  const normalizedHourly = {};
  for (let h = 0; h < 24; h++) {
    const key = String(h).padStart(2, '0');
    const bucket = hourly[key] || {};
    normalizedHourly[key] = {
      ...bucket,
      avgTemperature: bucket.tempCount ? Math.round((Number(bucket.tempSum || 0) / Number(bucket.tempCount)) * 10) / 10 : null,
      avgHumidity: bucket.humidityCount ? Math.round((Number(bucket.humiditySum || 0) / Number(bucket.humidityCount)) * 10) / 10 : null,
      lightOnMinutes: Math.round(Number(bucket.lightOnMinutes || 0)),
      fanOnMinutes: Math.round(Number(bucket.fanOnMinutes || 0)),
    };
  }
  return { ...row, hourly: normalizedHourly };
}

app.get('/access/cards', requireAuth, async (req, res) => {
  const snap = await db.collection('accessCards').orderBy('updatedAt', 'desc').limit(200).get();
  res.json(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
});

app.post('/access/cards', requireAuth, async (req, res) => {
  const body = req.body || {};
  const uid = normalizeUid(body.uid);
  if (!uid) return res.status(400).json({ error: 'UID_REQUIRED' });
  const target = body.target === 'garageDoor' ? 'garageDoor' : 'mainDoor';
  const data = {
    uid,
    name: String(body.name || `Thẻ ${uid}`).trim(),
    target,
    enabled: parseBool(body.enabled, true),
    accessType: body.accessType || 'full_time',
    timeWindow: body.timeWindow || null,
    dateRange: body.dateRange || null,
    createdBy: req.user.username || req.user.sub,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtIso: nowIso(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAtIso: nowIso(),
  };
  const ref = await db.collection('accessCards').add(data);
  writeFirestore('events', { type: 'access_card_created', source: 'web_app', target, message: `Tạo thẻ ${data.name}` });
  res.status(201).json({ id: ref.id, ...data });
});

app.patch('/access/cards/:id', requireAuth, async (req, res) => {
  const patch = {};
  const body = req.body || {};
  if (body.uid !== undefined) patch.uid = normalizeUid(body.uid);
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.target !== undefined) patch.target = body.target === 'garageDoor' ? 'garageDoor' : 'mainDoor';
  if (body.enabled !== undefined) patch.enabled = parseBool(body.enabled, true);
  if (body.accessType !== undefined) patch.accessType = body.accessType;
  if (body.timeWindow !== undefined) patch.timeWindow = body.timeWindow || null;
  if (body.dateRange !== undefined) patch.dateRange = body.dateRange || null;
  patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  patch.updatedAtIso = nowIso();
  await db.collection('accessCards').doc(req.params.id).set(patch, { merge: true });
  res.json({ id: req.params.id, ...patch });
});

app.delete('/access/cards/:id', requireAuth, async (req, res) => {
  await db.collection('accessCards').doc(req.params.id).delete();
  writeFirestore('events', { type: 'access_card_deleted', source: 'web_app', target: 'rfid', message: `Xóa thẻ ${req.params.id}` });
  res.json({ ok: true });
});

app.post('/access/cards/enroll', requireAuth, (req, res) => {
  rfidEnrollment = {
    target: req.body?.target === 'garageDoor' ? 'garageDoor' : 'mainDoor',
    name: String(req.body?.name || '').trim(),
    user: req.user.username || req.user.sub,
    expiresAt: Date.now() + 60000,
  };
  res.json({ ok: true, expiresInSeconds: 60 });
});

app.get('/access/passwords', requireAuth, async (req, res) => {
  const snap = await db.collection('accessPasswords').orderBy('updatedAt', 'desc').limit(200).get();
  res.json(snap.docs.map(doc => {
    const data = doc.data();
    delete data.passwordHash;
    return { id: doc.id, ...data, status: accessAllowed(data).ok ? 'active' : isExpired(data) ? 'expired' : 'limited' };
  }));
});

app.post('/access/passwords', requireAuth, async (req, res) => {
  const body = req.body || {};
  const password = String(body.password || '');
  if (password.length < 4 || password.length > 16) return res.status(400).json({ error: 'PASSWORD_LENGTH_INVALID' });
  const type = body.type === 'master' ? 'master' : (body.type || 'temporary');
  if (type === 'master') {
    const currentMaster = await db.collection('accessPasswords').where('type', '==', 'master').limit(1).get();
    if (!currentMaster.empty) return res.status(409).json({ error: 'MASTER_PASSWORD_EXISTS' });
  }
  const now = new Date();
  const expiresAtIso = body.relativeMinutes
    ? new Date(now.getTime() + Math.max(1, Math.min(1440, Number(body.relativeMinutes))) * 60000).toISOString()
    : (body.expiresAtIso || null);
  const data = {
    name: String(body.name || 'Mật khẩu tạm').trim(),
    type,
    target: 'mainDoor',
    enabled: parseBool(body.enabled, true),
    accessType: type === 'master' ? 'full_time' : (body.accessType || 'full_time'),
    timeWindow: body.timeWindow || null,
    dateRange: body.dateRange || null,
    expiresAtIso,
    autoDeleteWhenExpired: type !== 'master',
    passwordHash: await bcrypt.hash(password, 12),
    passwordHashAlgo: 'bcrypt',
    createdBy: req.user.username || req.user.sub,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtIso: nowIso(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAtIso: nowIso(),
  };
  const ref = await db.collection('accessPasswords').add(data);
  writeFirestore('events', { type: 'access_password_created', source: 'web_app', target: 'mainDoor', message: `Tạo mật khẩu ${data.name}` });
  delete data.passwordHash;
  res.status(201).json({ id: ref.id, ...data, status: 'active' });
});

app.patch('/access/passwords/:id', requireAuth, async (req, res) => {
  const body = req.body || {};
  const patch = {};
  ['name', 'type', 'accessType', 'timeWindow', 'dateRange', 'expiresAtIso'].forEach(k => {
    if (body[k] !== undefined) patch[k] = body[k] || null;
  });
  if (body.enabled !== undefined) patch.enabled = parseBool(body.enabled, true);
  if (body.password) patch.passwordHash = await bcrypt.hash(String(body.password), 12);
  patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  patch.updatedAtIso = nowIso();
  await db.collection('accessPasswords').doc(req.params.id).set(patch, { merge: true });
  delete patch.passwordHash;
  res.json({ id: req.params.id, ...patch });
});

app.delete('/access/passwords/:id', requireAuth, async (req, res) => {
  const ref = db.collection('accessPasswords').doc(req.params.id);
  const doc = await ref.get();
  if (doc.exists && doc.data().type === 'master') return res.status(409).json({ error: 'CANNOT_DELETE_MASTER' });
  await ref.delete();
  res.json({ ok: true });
});

app.post('/settings/device', requireAuth, async (req, res) => {
  const { deviceId, settings = {} } = req.body || {};
  const allowed = ['mainDoor', 'garageDoor', 'hallwayLight', 'environmentFan'];
  if (!allowed.includes(deviceId)) return res.status(400).json({ error: 'INVALID_DEVICE_ID' });
  setFirestoreDoc(`devices/${deviceId}`, settings);
  res.json({ ok: true });
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
//   POST /fan   { mode: "auto"|"manual"|"off", dir: 1|-1|0, speed: 0-100 }
app.post('/fan', requireAuth, (req, res) => {
  const { mode, dir = 0, speed = 0 } = req.body;
  let cmd, payload;

  if (mode === 'auto') {
    cmd     = 'fan_auto';
    payload = null;
    writeTempLog('INFO', 'Web: bat quat che do tu dong');
  } else if (mode === 'off' || (mode === 'manual' && parseInt(speed) === 0)) {
    cmd     = 'fan_set';
    payload = '0:0';
    writeTempLog('INFO', 'Web: tat quat');
  } else {
    // manual: dir = 1 (thuan) | -1 (nguoc), speed = 0-100%
    const d = Math.max(-1, Math.min(1, parseInt(dir) || 0));
    const s = Math.max(0,   Math.min(100, parseInt(speed) || 50));
    cmd     = 'fan_set';
    payload = `${d}:${s}`;
    writeTempLog('INFO', `Web: dat quat manual dir=${d} speed=${s}%`);
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

app.post('/light/settings', requireAuth, (req, res) => {
  const hold = Math.max(1, Math.min(600, parseInt(req.body?.holdSeconds, 10) || 20));
  const brightness = Math.max(10, Math.min(100, parseInt(req.body?.brightness, 10) || 70));
  const effect = String(req.body?.effect || 'static').toLowerCase();
  setFirestoreDoc('devices/hallwayLight', {
    minOnSeconds: hold,
    maxBrightness: brightness,
    effect,
  });
  routeCmd(res, 'light_config', `${hold}:${brightness}:${effect}`, 'light_config');
});

app.post('/fan/settings', requireAuth, (req, res) => {
  const tempOn = Number(req.body?.temperatureOnThreshold ?? 32);
  const tempOff = Number(req.body?.temperatureOffThreshold ?? 30);
  const humOn = Number(req.body?.humidityOnThreshold ?? 75);
  const humOff = Number(req.body?.humidityOffThreshold ?? 65);
  if (!(tempOff < tempOn) || !(humOff < humOn)) {
    return res.status(400).json({ error: 'OFF_THRESHOLD_MUST_BE_LOWER_THAN_ON_THRESHOLD' });
  }
  setFirestoreDoc('devices/environmentFan', {
    temperatureOnThreshold: tempOn,
    temperatureOffThreshold: tempOff,
    humidityOnThreshold: humOn,
    humidityOffThreshold: humOff,
  });
  routeCmd(res, 'fan_config', `${tempOn}:${tempOff}:${humOn}:${humOff}`, 'fan_config');
});

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

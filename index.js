const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'SECRET_KEY_9876543210';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DB_FILE = path.join(__dirname, 'keys.json');

// --- Helper Functions to Read/Write Database ---
function getDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (!data.keys) data.keys = {};
      if (!data.app_update) {
        data.app_update = {
          latest_version: '1.0.0',
          apk_url: 'https://example.com/app.apk',
          force_update: false,
          changelog: 'Initial Release'
        };
      }
      if (!data.security) {
        data.security = { apk_hash: 'DEFAULT_HASH' };
      }
      if (!data.web_info) {
        data.web_info = {
          client: 'ARENA MOD',
          license: 'Qp5KSGTquetnUkjX6UVBAURH8hTkZuLM',
          version: '1.0.0',
          author: '@hawali7',
          telegram: 'https://t.me/angrymodofficials'
        };
      }
      if (!data.custom_config) {
        data.custom_config = {
          maintenance: false,
          server_message: "Server is fully operational",
          status: "online"
        };
      }
      return data;
    }
  } catch (err) {
    console.error('Error reading database:', err);
  }
  return { keys: {}, app_update: {}, security: {}, web_info: {}, custom_config: {} };
}

function saveDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing database:', err);
  }
}

// ==========================================
// 1. ENDPOINT: /connect
// ==========================================

// GET /connect -> जब ब्राउज़र में खोलें
app.get('/connect', (req, res) => {
  const db = getDb();
  const info = db.web_info || {
    client: 'ANGRY MOD',
    license: 'Qp5KSGTquetnUkjX6UVBAURH8hTkZuLM',
    version: '1.0.0',
    author: '@hawali7',
    telegram: 'https://t.me/angrymodofficials'
  };

  return res.json({
    web_info: {
      _client: info.client,
      license: info.license,
      version: info.version
    },
    web_dev: {
      author: info.author,
      telegram: info.telegram
    }
  });
});

// POST /connect -> जब ऐप लॉगिन/लाइसेंस वेरिफाई करे
app.post('/connect', (req, res) => {
  // Support both standard names and Android app parameters (user_key, serial)
  const license_key = (req.body.user_key || req.body.license_key || req.body.key || req.query.user_key || req.query.license_key || '').toString().trim();
  const device_id = (req.body.serial || req.body.device_id || req.body.hwid || req.query.serial || req.query.device_id || '').toString().trim();

  if (!license_key || !device_id) {
    return res.status(200).json({
      status: false,
      crash: false,
      reason: 'Missing license key or device serial'
    });
  }

  const db = getDb();
  const keyData = db.keys[license_key];

  if (!keyData || !keyData.isActive) {
    return res.status(200).json({
      status: false,
      crash: false,
      reason: 'Invalid or blocked license key'
    });
  }

  const now = new Date();
  const expDate = new Date(keyData.expiresAt);
  if (now > expDate) {
    return res.status(200).json({
      status: false,
      crash: false,
      reason: 'License key has expired'
    });
  }

  if (!keyData.deviceId) {
    keyData.deviceId = device_id;
    db.keys[license_key] = keyData;
    saveDb(db);
  } else if (keyData.deviceId !== device_id) {
    return res.status(200).json({
      status: false,
      crash: false,
      reason: 'Device mismatch: Key is locked to another device'
    });
  }

  const token = jwt.sign(
    {
      key: license_key,
      device: device_id,
      exp: Math.floor(expDate.getTime() / 1000)
    },
    JWT_SECRET
  );

  // Format expiry date like YYYY-MM-DD HH:MM:SS
  const expStr = expDate.toISOString().replace('T', ' ').substring(0, 19);

  return res.status(200).json({
    status: true,
    crash: false,
    data: {
      user_key: license_key,
      expired_date: expStr,
      seller_name: "ARENA MOD",
      registrator: "ARENA MOD"
    },
    reason: 'Login Success',
    exp: expStr,
    token: token
  });
});

// ==========================================
// 2. ENDPOINT: APP UPDATE (/update.php)
// ==========================================
const handleUpdate = (req, res) => {
  const db = getDb();
  const updateInfo = db.app_update || {};
  return res.json({
    status: true,
    version: updateInfo.latest_version || '1.0.0',
    download_url: updateInfo.apk_url || '',
    force_update: !!updateInfo.force_update,
    changelog: updateInfo.changelog || 'Latest updates and bug fixes.'
  });
};
app.get('/update.php', handleUpdate);
app.post('/update.php', handleUpdate);
app.get('/update', handleUpdate);

// ==========================================
// 3. ENDPOINT: APK INTEGRITY CHECK (/apkhash.php)
// ==========================================
const handleApkHash = (req, res) => {
  const db = getDb();
  const serverHash = (db.security && db.security.apk_hash) || '';
  const clientHash = req.body?.hash || req.query?.hash;

  if (clientHash) {
    if (clientHash.trim().toLowerCase() === serverHash.trim().toLowerCase()) {
      return res.json({ status: true, reason: 'APK integrity verified' });
    } else {
      return res.status(200).json({ status: false, reason: 'APK integrity check failed (Tampered)' });
    }
  }

  return res.json({
    status: true,
    server_hash: serverHash
  });
};
app.get('/apkhash.php', handleApkHash);
app.post('/apkhash.php', handleApkHash);
app.get('/apkhash', handleApkHash);

// ==========================================
// 4. ENDPOINT: CUSTOM CONFIG / STATUS (/hdshrs.php)
// ==========================================
const handleHdshrs = (req, res) => {
  const db = getDb();
  const config = db.custom_config || {
    maintenance: false,
    server_message: "Server is running smoothly",
    status: true
  };
  return res.json({
    status: true,
    maintenance: false,
    server_message: config.server_message || "Server is running smoothly"
  });
};
app.get('/hdshrs.php', handleHdshrs);
app.post('/hdshrs.php', handleHdshrs);
app.get('/hdshrs', handleHdshrs);

// ==========================================
// 5. ADMIN API ENDPOINTS
// ==========================================
function getAdminPassword() {
  const db = getDb();
  if (db.admin_password) return db.admin_password;
  return ADMIN_PASSWORD;
}

function checkAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const currentPass = getAdminPassword();
  if (authHeader && authHeader === `Bearer ${currentPass}`) {
    return next();
  }
  return res.status(401).json({ status: 'failed', reason: 'Unauthorized Admin' });
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  const currentPass = getAdminPassword();
  if (password === currentPass) {
    return res.json({ status: 'success', token: currentPass });
  }
  return res.status(401).json({ status: 'failed', reason: 'Wrong password' });
});

app.post('/api/admin/change-password', checkAdminAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const currentPass = getAdminPassword();

  if (currentPassword !== currentPass) {
    return res.status(400).json({ status: 'failed', reason: 'Current password does not match' });
  }

  if (!newPassword || newPassword.trim().length < 3) {
    return res.status(400).json({ status: 'failed', reason: 'New password must be at least 3 characters long' });
  }

  const db = getDb();
  db.admin_password = newPassword.trim();
  saveDb(db);

  return res.json({
    status: 'success',
    token: db.admin_password,
    message: 'Admin password updated successfully!'
  });
});

app.get('/api/admin/data', checkAdminAuth, (req, res) => {
  const db = getDb();
  return res.json({ status: 'success', data: db });
});

app.post('/api/admin/create-key', checkAdminAuth, (req, res) => {
  const { prefix, durationDays, durationHours, note } = req.body || {};
  const db = getDb();

  const days = parseInt(durationDays) || 0;
  const hours = parseInt(durationHours) || 0;
  const totalMs = (days * 24 * 60 * 60 * 1000) + (hours * 60 * 60 * 1000);

  if (totalMs <= 0) {
    return res.status(400).json({ status: 'failed', reason: 'Duration must be greater than 0' });
  }

  const randomStr = crypto.randomBytes(4).toString('hex').toUpperCase();
  const keyName = (prefix && prefix.trim()) 
    ? `${prefix.trim().toUpperCase()}-${randomStr}` 
    : `VIP-${randomStr}`;

  const expiresAt = new Date(Date.now() + totalMs).toISOString();

  db.keys[keyName] = {
    deviceId: null,
    expiresAt: expiresAt,
    isActive: true,
    durationDays: days + (hours / 24),
    createdAt: new Date().toISOString(),
    note: note || ''
  };

  saveDb(db);
  return res.json({ status: 'success', key: keyName, data: db.keys[keyName] });
});

app.post('/api/admin/delete-key', checkAdminAuth, (req, res) => {
  const { key } = req.body || {};
  const db = getDb();
  if (db.keys[key]) {
    delete db.keys[key];
    saveDb(db);
    return res.json({ status: 'success' });
  }
  return res.status(404).json({ status: 'failed', reason: 'Key not found' });
});

app.post('/api/admin/reset-hwid', checkAdminAuth, (req, res) => {
  const { key } = req.body || {};
  const db = getDb();
  if (db.keys[key]) {
    db.keys[key].deviceId = null;
    saveDb(db);
    return res.json({ status: 'success' });
  }
  return res.status(404).json({ status: 'failed', reason: 'Key not found' });
});

app.post('/api/admin/toggle-key', checkAdminAuth, (req, res) => {
  const { key } = req.body || {};
  const db = getDb();
  if (db.keys[key]) {
    db.keys[key].isActive = !db.keys[key].isActive;
    saveDb(db);
    return res.json({ status: 'success', isActive: db.keys[key].isActive });
  }
  return res.status(404).json({ status: 'failed', reason: 'Key not found' });
});

app.post('/api/admin/update-settings', checkAdminAuth, (req, res) => {
  const { latest_version, apk_url, force_update, changelog, apk_hash, client_name, client_license, client_author, client_telegram, custom_config_json } = req.body || {};
  const db = getDb();

  db.app_update = {
    latest_version: latest_version || db.app_update.latest_version,
    apk_url: apk_url || db.app_update.apk_url,
    force_update: !!force_update,
    changelog: changelog || db.app_update.changelog
  };

  if (apk_hash !== undefined) {
    db.security.apk_hash = apk_hash;
  }

  if (!db.web_info) db.web_info = {};
  if (client_name) db.web_info.client = client_name;
  if (client_license) db.web_info.license = client_license;
  if (client_author) db.web_info.author = client_author;
  if (client_telegram) db.web_info.telegram = client_telegram;

  if (custom_config_json) {
    try {
      db.custom_config = JSON.parse(custom_config_json);
    } catch (e) {
      console.error('Invalid JSON for custom_config');
    }
  }

  saveDb(db);
  return res.json({ status: 'success' });
});

// ==========================================
// 6. ADMIN WEB PANEL UI (HTML/CSS/JS at public/index.html)
// ==========================================
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

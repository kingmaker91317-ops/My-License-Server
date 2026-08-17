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
          client: 'ANGRY MOD',
          license: 'Qp5KSGTquetnUkjX6UVBAURH8hTkZuLM',
          version: '1.0.0',
          author: '@hawali7',
          telegram: 'https://t.me/angrymodofficials'
        };
      }
      return data;
    }
  } catch (err) {
    console.error('Error reading database:', err);
  }
  return { keys: {}, app_update: {}, security: {}, web_info: {} };
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

// GET /connect -> जब कोई ब्राउज़र में खोलेगा तो यह JSON दिखेगा
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

// POST /connect -> जब ऐप लॉगिन/लाइसेंस वेरिफाई करेगा
app.post('/connect', (req, res) => {
  const { license_key, device_id } = req.body || {};

  if (!license_key || !device_id) {
    return res.status(400).json({
      status: 'failed',
      reason: 'Missing license_key or device_id'
    });
  }

  const db = getDb();
  const keyData = db.keys[license_key];

  if (!keyData || !keyData.isActive) {
    return res.status(401).json({
      status: 'failed',
      reason: 'Invalid or blocked license key'
    });
  }

  const now = new Date();
  const expDate = new Date(keyData.expiresAt);
  if (now > expDate) {
    return res.status(403).json({
      status: 'failed',
      reason: 'License key has expired'
    });
  }

  if (!keyData.deviceId) {
    keyData.deviceId = device_id;
    db.keys[license_key] = keyData;
    saveDb(db);
  } else if (keyData.deviceId !== device_id) {
    return res.status(403).json({
      status: 'failed',
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

  return res.status(200).json({
    status: 'success',
    reason: 'Login successful',
    exp: keyData.expiresAt,
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
    status: 'success',
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
      return res.json({ status: 'valid', reason: 'APK integrity verified' });
    } else {
      return res.status(403).json({ status: 'invalid', reason: 'APK integrity check failed (Tampered)' });
    }
  }

  return res.json({
    status: 'success',
    server_hash: serverHash
  });
};
app.get('/apkhash.php', handleApkHash);
app.post('/apkhash.php', handleApkHash);
app.get('/apkhash', handleApkHash);

// ==========================================
// 4. ADMIN API ENDPOINTS
// ==========================================
function checkAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader === `Bearer ${ADMIN_PASSWORD}`) {
    return next();
  }
  return res.status(401).json({ status: 'failed', reason: 'Unauthorized Admin' });
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    return res.json({ status: 'success', token: ADMIN_PASSWORD });
  }
  return res.status(401).json({ status: 'failed', reason: 'Wrong password' });
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
    : `KEY-${randomStr}`;

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
  const { latest_version, apk_url, force_update, changelog, apk_hash, client_name, client_license, client_author, client_telegram } = req.body || {};
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

  saveDb(db);
  return res.json({ status: 'success' });
});

// ==========================================
// 5. ADMIN WEB PANEL UI (HTML/CSS/JS at root `/`)
// ==========================================
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Panel - License & Update Manager</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    body { background-color: #0f172a; color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    .card { background-color: #1e293b; border: 1px solid #334155; border-radius: 12px; }
    .card-header { background-color: #334155; border-bottom: 1px solid #475569; font-weight: 600; }
    .form-control, .form-select { background-color: #0f172a; border-color: #475569; color: #f8fafc; }
    .form-control:focus, .form-select:focus { background-color: #0f172a; border-color: #38bdf8; color: #f8fafc; box-shadow: 0 0 0 0.25rem rgba(56, 189, 248, 0.25); }
    .table { color: #f8fafc; }
    .table-dark { background-color: #1e293b; }
    .badge-active { background-color: #10b981; }
    .badge-expired { background-color: #ef4444; }
    .badge-bound { background-color: #6366f1; }
    .badge-unbound { background-color: #f59e0b; }
    .nav-tabs .nav-link { color: #94a3b8; }
    .nav-tabs .nav-link.active { background-color: #1e293b; border-color: #334155 #334155 #1e293b; color: #38bdf8; font-weight: 600; }
  </style>
</head>
<body class="p-3 p-md-5">

  <div class="container" style="max-width: 1100px;">
    
    <!-- LOGIN SCREEN -->
    <div id="loginScreen" class="row justify-content-center" style="margin-top: 100px;">
      <div class="col-md-5">
        <div class="card shadow-lg p-4 text-center">
          <h3 class="mb-3 text-info"><i class="fa-solid fa-shield-halved"></i> License Admin</h3>
          <p class="text-secondary small">Enter Admin Password to manage keys & updates</p>
          <div class="mb-3">
            <input type="password" id="adminPasswordInput" class="form-control text-center form-control-lg" placeholder="Admin Password (default: admin123)">
          </div>
          <button onclick="loginAdmin()" class="btn btn-info w-100 btn-lg fw-bold"><i class="fa-solid fa-lock-open"></i> Login</button>
          <div id="loginError" class="text-danger mt-2 small" style="display:none;"></div>
        </div>
      </div>
    </div>

    <!-- MAIN DASHBOARD (Initially Hidden) -->
    <div id="dashboardScreen" style="display: none;">
      
      <!-- Top Header -->
      <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h2 class="text-info mb-0"><i class="fa-solid fa-server"></i> License & Control Panel</h2>
          <small class="text-secondary">Connected Endpoints: <code>/connect</code> | <code>/update.php</code> | <code>/apkhash.php</code></small>
        </div>
        <button onclick="logoutAdmin()" class="btn btn-outline-danger btn-sm"><i class="fa-solid fa-right-from-bracket"></i> Logout</button>
      </div>

      <!-- Navigation Tabs -->
      <ul class="nav nav-tabs mb-4" id="adminTabs">
        <li class="nav-item">
          <a class="nav-link active" href="#" onclick="switchTab('keysTab', this)"><i class="fa-solid fa-key"></i> License Keys</a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="#" onclick="switchTab('appUpdateTab', this)"><i class="fa-solid fa-cloud-arrow-up"></i> App Update & Branding</a>
        </li>
      </ul>

      <!-- TAB 1: LICENSE KEYS -->
      <div id="keysTab">
        <div class="row g-4">
          
          <!-- Key Generator Form -->
          <div class="col-lg-4">
            <div class="card shadow">
              <div class="card-header"><i class="fa-solid fa-plus-circle text-info"></i> Create New Key</div>
              <div class="card-body">
                <div class="mb-3">
                  <label class="form-label small">Key Prefix (e.g. VIP, USER, PRO):</label>
                  <input type="text" id="newKeyPrefix" class="form-control" placeholder="VIP" value="VIP">
                </div>
                <div class="row mb-3">
                  <div class="col-6">
                    <label class="form-label small">Days:</label>
                    <input type="number" id="newKeyDays" class="form-control" value="30" min="0">
                  </div>
                  <div class="col-6">
                    <label class="form-label small">Hours:</label>
                    <input type="number" id="newKeyHours" class="form-control" value="0" min="0">
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label small">Note / Customer Name:</label>
                  <input type="text" id="newKeyNote" class="form-control" placeholder="John Doe">
                </div>
                <button onclick="createKey()" class="btn btn-info w-100 fw-bold"><i class="fa-solid fa-wand-magic-sparkles"></i> Generate Key</button>
              </div>
            </div>
          </div>

          <!-- Keys List Table -->
          <div class="col-lg-8">
            <div class="card shadow">
              <div class="card-header d-flex justify-content-between align-items-center">
                <span><i class="fa-solid fa-list text-info"></i> Active Keys (<span id="keyCount">0</span>)</span>
                <button onclick="fetchDashboardData()" class="btn btn-sm btn-outline-info"><i class="fa-solid fa-rotate"></i> Refresh</button>
              </div>
              <div class="card-body p-0 table-responsive">
                <table class="table table-dark table-hover mb-0 align-middle">
                  <thead>
                    <tr class="text-secondary small">
                      <th>License Key</th>
                      <th>Expires</th>
                      <th>Device (HWID)</th>
                      <th>Status</th>
                      <th class="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="keysTableBody">
                    <tr><td colspan="5" class="text-center py-4 text-secondary">Loading keys...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- TAB 2: APP UPDATE & BRANDING -->
      <div id="appUpdateTab" style="display: none;">
        <div class="card shadow mb-4">
          <div class="card-header"><i class="fa-solid fa-globe text-info"></i> Branding Info (Displayed on <code>GET /connect</code> in browser)</div>
          <div class="card-body">
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label small">Client Name:</label>
                <input type="text" id="clientName" class="form-control" placeholder="ANGRY MOD">
              </div>
              <div class="col-md-6">
                <label class="form-label small">License String:</label>
                <input type="text" id="clientLicense" class="form-control" placeholder="Qp5KSGTquetnUkjX6UVBAURH8hTkZuLM">
              </div>
              <div class="col-md-6">
                <label class="form-label small">Author:</label>
                <input type="text" id="clientAuthor" class="form-control" placeholder="@hawali7">
              </div>
              <div class="col-md-6">
                <label class="form-label small">Telegram Link:</label>
                <input type="text" id="clientTelegram" class="form-control" placeholder="https://t.me/angrymodofficials">
              </div>
            </div>
          </div>
        </div>

        <div class="card shadow mb-4">
          <div class="card-header"><i class="fa-solid fa-cloud-arrow-down text-info"></i> App Update Configuration (<code>/update.php</code>)</div>
          <div class="card-body">
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label small">Latest App Version:</label>
                <input type="text" id="updateVersion" class="form-control" placeholder="1.0.0">
              </div>
              <div class="col-md-6">
                <label class="form-label small">APK Download URL:</label>
                <input type="text" id="updateUrl" class="form-control" placeholder="https://mywebsite.com/download.apk">
              </div>
              <div class="col-12">
                <div class="form-check form-switch mt-2">
                  <input class="form-check-input" type="checkbox" id="forceUpdateCheck">
                  <label class="form-check-label" for="forceUpdateCheck">Force Update (Users must update to use app)</label>
                </div>
              </div>
              <div class="col-12">
                <label class="form-label small">Changelog / Update Message:</label>
                <textarea id="updateChangelog" class="form-control" rows="2" placeholder="Bug fixes and new features added."></textarea>
              </div>
            </div>
          </div>
        </div>

        <div class="card shadow">
          <div class="card-header"><i class="fa-solid fa-fingerprint text-info"></i> APK Hash / Anti-Tamper Check (<code>/apkhash.php</code>)</div>
          <div class="card-body">
            <div class="mb-3">
              <label class="form-label small">Expected Original APK SHA256 / Hash:</label>
              <input type="text" id="apkHash" class="form-control" placeholder="e.g. e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855">
            </div>
            <button onclick="saveSettings()" class="btn btn-success fw-bold"><i class="fa-solid fa-floppy-disk"></i> Save All Settings</button>
          </div>
        </div>
      </div>

    </div>
  </div>

  <script>
    let currentToken = localStorage.getItem('admin_token') || '';

    if (currentToken) {
      showDashboard();
    }

    function switchTab(tabId, el) {
      document.getElementById('keysTab').style.display = tabId === 'keysTab' ? 'block' : 'none';
      document.getElementById('appUpdateTab').style.display = tabId === 'appUpdateTab' ? 'block' : 'none';
      document.querySelectorAll('#adminTabs .nav-link').forEach(link => link.classList.remove('active'));
      el.classList.add('active');
    }

    async function loginAdmin() {
      const password = document.getElementById('adminPasswordInput').value;
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.status === 'success') {
        currentToken = data.token;
        localStorage.setItem('admin_token', currentToken);
        showDashboard();
      } else {
        const errEl = document.getElementById('loginError');
        errEl.innerText = data.reason || 'Incorrect password';
        errEl.style.display = 'block';
      }
    }

    function logoutAdmin() {
      localStorage.removeItem('admin_token');
      currentToken = '';
      document.getElementById('dashboardScreen').style.display = 'none';
      document.getElementById('loginScreen').style.display = 'flex';
    }

    function showDashboard() {
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('dashboardScreen').style.display = 'block';
      fetchDashboardData();
    }

    async function fetchDashboardData() {
      try {
        const res = await fetch('/api/admin/data', {
          headers: { 'Authorization': 'Bearer ' + currentToken }
        });
        if (res.status === 401) return logoutAdmin();
        const json = await res.json();
        renderData(json.data);
      } catch (err) {
        console.error(err);
      }
    }

    function renderData(data) {
      // Render Keys
      const tbody = document.getElementById('keysTableBody');
      const keys = data.keys || {};
      const keyNames = Object.keys(keys);
      document.getElementById('keyCount').innerText = keyNames.length;

      if (keyNames.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-secondary">No keys generated yet.</td></tr>';
      } else {
        tbody.innerHTML = keyNames.map(k => {
          const item = keys[k];
          const isExpired = new Date() > new Date(item.expiresAt);
          const expFormatted = new Date(item.expiresAt).toLocaleDateString() + ' ' + new Date(item.expiresAt).toLocaleTimeString();
          
          return \`<tr>
            <td>
              <div class="fw-bold text-info cursor-pointer" onclick="copyKey('\${k}')" title="Click to copy">
                \${k} <i class="fa-regular fa-copy small ms-1"></i>
              </div>
              \${item.note ? '<small class="text-secondary">' + item.note + '</small>' : ''}
            </td>
            <td class="small \${isExpired ? 'text-danger' : 'text-success'}">
              \${expFormatted}
            </td>
            <td>
              \${item.deviceId ? '<span class="badge badge-bound" title="' + item.deviceId + '"><i class="fa-solid fa-mobile-screen"></i> Locked</span>' : '<span class="badge badge-unbound">Not Bound</span>'}
            </td>
            <td>
              \${isExpired ? '<span class="badge badge-expired">Expired</span>' : (item.isActive ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-expired">Blocked</span>')}
            </td>
            <td class="text-end">
              \${item.deviceId ? '<button onclick="resetHwid(\\''+k+'\\')" class="btn btn-sm btn-outline-warning me-1" title="Reset Device Binding"><i class="fa-solid fa-arrows-rotate"></i></button>' : ''}
              <button onclick="toggleKey(\\''+k+'\\')" class="btn btn-sm btn-outline-secondary me-1" title="Block/Unblock"><i class="fa-solid fa-power-off"></i></button>
              <button onclick="deleteKey(\\''+k+'\\')" class="btn btn-sm btn-outline-danger" title="Delete Key"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>\`;
        }).join('');
      }

      // Render App Update & Security & Branding
      if (data.app_update) {
        document.getElementById('updateVersion').value = data.app_update.latest_version || '';
        document.getElementById('updateUrl').value = data.app_update.apk_url || '';
        document.getElementById('forceUpdateCheck').checked = !!data.app_update.force_update;
        document.getElementById('updateChangelog').value = data.app_update.changelog || '';
      }
      if (data.security) {
        document.getElementById('apkHash').value = data.security.apk_hash || '';
      }
      if (data.web_info) {
        document.getElementById('clientName').value = data.web_info.client || 'ANGRY MOD';
        document.getElementById('clientLicense').value = data.web_info.license || 'Qp5KSGTquetnUkjX6UVBAURH8hTkZuLM';
        document.getElementById('clientAuthor').value = data.web_info.author || '@hawali7';
        document.getElementById('clientTelegram').value = data.web_info.telegram || 'https://t.me/angrymodofficials';
      }
    }

    async function createKey() {
      const prefix = document.getElementById('newKeyPrefix').value;
      const days = document.getElementById('newKeyDays').value;
      const hours = document.getElementById('newKeyHours').value;
      const note = document.getElementById('newKeyNote').value;

      const res = await fetch('/api/admin/create-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
        body: JSON.stringify({ prefix, durationDays: days, durationHours: hours, note })
      });
      const data = await res.json();
      if (data.status === 'success') {
        alert('Key created successfully: ' + data.key);
        fetchDashboardData();
      } else {
        alert('Error: ' + data.reason);
      }
    }

    async function deleteKey(key) {
      if (!confirm('Are you sure you want to delete ' + key + '?')) return;
      await fetch('/api/admin/delete-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
        body: JSON.stringify({ key })
      });
      fetchDashboardData();
    }

    async function resetHwid(key) {
      await fetch('/api/admin/reset-hwid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
        body: JSON.stringify({ key })
      });
      alert('Device reset! Key can now be used on a new device.');
      fetchDashboardData();
    }

    async function toggleKey(key) {
      await fetch('/api/admin/toggle-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
        body: JSON.stringify({ key })
      });
      fetchDashboardData();
    }

    async function saveSettings() {
      const latest_version = document.getElementById('updateVersion').value;
      const apk_url = document.getElementById('updateUrl').value;
      const force_update = document.getElementById('forceUpdateCheck').checked;
      const changelog = document.getElementById('updateChangelog').value;
      const apk_hash = document.getElementById('apkHash').value;
      const client_name = document.getElementById('clientName').value;
      const client_license = document.getElementById('clientLicense').value;
      const client_author = document.getElementById('clientAuthor').value;
      const client_telegram = document.getElementById('clientTelegram').value;

      const res = await fetch('/api/admin/update-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
        body: JSON.stringify({ latest_version, apk_url, force_update, changelog, apk_hash, client_name, client_license, client_author, client_telegram })
      });
      const data = await res.json();
      if (data.status === 'success') {
        alert('Settings saved successfully!');
        fetchDashboardData();
      }
    }

    function copyKey(key) {
      navigator.clipboard.writeText(key);
      alert('Copied to clipboard: ' + key);
    }
  </script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

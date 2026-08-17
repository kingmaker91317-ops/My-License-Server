const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_TO_A_SECURE_RANDOM_SECRET_KEY';
const KEYS_FILE = path.join(__dirname, 'keys.json');

// Helper: Read keys from keys.json
function getKeysDatabase() {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      const data = fs.readFileSync(KEYS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading keys.json:', err);
  }
  return {};
}

// Helper: Save keys to keys.json
function saveKeysDatabase(data) {
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving keys.json:', err);
  }
}

// Health check endpoint (Used by UptimeRobot to keep server 24/7 alive)
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'License Authentication Server is running 24/7',
    time: new Date().toISOString()
  });
});

// Main Connect Endpoint: POST /connect
app.post('/connect', (req, res) => {
  const { license_key, device_id } = req.body || {};

  // 1. Validation check
  if (!license_key || !device_id) {
    return res.status(400).json({
      status: 'failed',
      reason: 'Missing license_key or device_id'
    });
  }

  const database = getKeysDatabase();
  const keyData = database[license_key];

  // 2. Check if key exists and is active
  if (!keyData || !keyData.isActive) {
    return res.status(401).json({
      status: 'failed',
      reason: 'Invalid or blocked license key'
    });
  }

  // 3. Expiration check
  const now = new Date();
  const expDate = new Date(keyData.expiresAt);
  if (now > expDate) {
    return res.status(403).json({
      status: 'failed',
      reason: 'License key has expired'
    });
  }

  // 4. HWID / Device Binding check
  if (!keyData.deviceId) {
    // First time login: Bind device ID
    keyData.deviceId = device_id;
    database[license_key] = keyData;
    saveKeysDatabase(database);
    console.log(`[BIND] Key ${license_key} bound to device ${device_id}`);
  } else if (keyData.deviceId !== device_id) {
    return res.status(403).json({
      status: 'failed',
      reason: 'License already registered to another device'
    });
  }

  // 5. Generate Session Authentication JWT Token
  const token = jwt.sign(
    {
      key: license_key,
      device: device_id,
      exp: Math.floor(expDate.getTime() / 1000)
    },
    JWT_SECRET
  );

  // 6. Success Response
  return res.status(200).json({
    status: 'success',
    reason: 'Login successful',
    exp: keyData.expiresAt,
    token: token
  });
});

// Admin endpoint to view / manage keys (Optional)
app.get('/admin/keys', (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== (process.env.ADMIN_SECRET || 'admin123')) {
    return res.status(403).json({ status: 'failed', reason: 'Unauthorized' });
  }
  return res.json(getKeysDatabase());
});

app.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(`License Server running on port ${PORT}`);
  console.log(`Endpoint: http://localhost:${PORT}/connect`);
  console.log(`===========================================`);
});

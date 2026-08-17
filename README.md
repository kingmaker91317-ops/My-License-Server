# 24/7 Free License Authentication Server

यह सर्वर आपके C++ क्लाइंट / ऐप से आने वाली POST रिक्वेस्ट (`/connect`) को वेरीफाई करता है और सुरक्षित JWT टोकन और एक्सपायरी रिस्पॉन्स भेजता है।

---

## सर्वर को 24/7 फ्री में लाइव करने के आसान स्टेप्स:

### स्टेप 1: GitHub पर कोड अपलोड करें
1. [GitHub.com](https://github.com/) पर जाएं और लॉगिन करें।
2. **New Repository** बनाएं (उदा. `license-auth-server`) और इसे **Public** या **Private** रखें।
3. अपने लैपटॉप में `auth-server` फ़ोल्डर में टर्मिनल खोलें और यह कमांड चलाएं:
   ```bash
   git init
   git add .
   git commit -m "First commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/license-auth-server.git
   git push -u origin main
   ```

---

### स्टेप 2: Render.com पर Free Host करें (HTTPS URL मिलेगा)
1. [Render.com](https://render.com/) पर जाएं और GitHub से लॉगिन करें।
2. **New +** > **Web Service** पर क्लिक करें।
3. अपनी रिपॉजिटरी `license-auth-server` को सेलेक्ट करके **Connect** दबाएं।
4. निम्नलिखित सेटिंग्स रखें:
   - **Name**: `my-license-api`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. **Create Web Service** पर क्लिक करें।
6. 1-2 मिनट में आपको लाइव URL मिल जाएगा, जैसे:
   `https://my-license-api.onrender.com`

---

### स्टेप 3: लैपटॉप बंद होने पर भी 24/7 चालू रखने के लिए (UptimeRobot)
1. [UptimeRobot.com](https://uptimerobot.com/) पर फ्री अकाउंट बनाएं।
2. **Add New Monitor** पर क्लिक करें:
   - **Monitor Type**: `HTTP(s)`
   - **Friendly Name**: `License Server 24/7`
   - **URL**: `https://my-license-api.onrender.com/`
   - **Monitoring Interval**: `5 minutes`
3. **Create Monitor** पर क्लिक करें।
👉 **अब आपका सर्वर 24 घंटे लगातार बिना सोए चलेगा, चाहे आपका लैपटॉप बंद हो!**

---

## नया लाइसेंस की (Key) कैसे जोड़ें?
`keys.json` फाइल में जाकर नई की जोड़ सकते हैं:
```json
"NEW-VIP-KEY": {
  "deviceId": null,
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "isActive": true
}
```

import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import TelegramBot from 'node-telegram-bot-api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ========== কনফিগারেশন ==========
const BOT_TOKEN = '8883310302:AAE7E4RXdhErGPJ1om-CLeCeoXSnbbdzQu4';
const BASE_URL = 'https://tnehimagetosharelinkgenerator.onrender.com';

// ফোল্ডার তৈরি
const uploadsDir = path.join(__dirname, '..', 'uploads');
const publicDir = path.join(__dirname, '..', 'public');
const botUploadsDir = path.join(__dirname, '..', 'bot_uploads');

[uploadsDir, publicDir, botUploadsDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// JSON ডাটাবেস
let images = {};
const dbFile = path.join(__dirname, '..', 'images.json');
if (fs.existsSync(dbFile)) {
    try {
        images = JSON.parse(fs.readFileSync(dbFile));
    } catch (e) {
        images = {};
    }
}

// ========== মিডলওয়্যার ==========
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(publicDir));

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ========== টেলিগ্রাম বোট (সিম্পল ফিক্সড) ==========
let bot;
let isBotRunning = false;

// ফেচ পলিফিল (Node 18 এর জন্য)
import fetch from 'node-fetch';

try {
    bot = new TelegramBot(BOT_TOKEN, { 
        polling: true,
        request: {
            timeout: 30000
        }
    });
    
    // বট স্টার্ট হলে
    bot.on('polling_start', () => {
        console.log('🤖 Bot polling started');
        isBotRunning = true;
    });
    
    // বটের তথ্য
    bot.getMe().then(botInfo => {
        console.log(`✅ Bot @${botInfo.username} is running`);
    }).catch(err => {
        console.log('Bot getMe error:', err.message);
    });
    
    // ========== স্টার্ট কমান্ড ==========
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, `
🎉 *Welcome to TNEH Image Share Bot!* 🎉

Send me any image and I will give you a shareable link.

*Just send me a photo now!* 📸

Commands:
/help - Help guide
/stats - Your stats
        `, { parse_mode: 'Markdown' });
    });
    
    // ========== হেল্প কমান্ড ==========
    bot.onText(/\/help/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, `
📖 *How to use:*
1. Send me any photo
2. Wait a moment
3. Get your shareable link

*Supported:* Any image format
*Size limit:* 10MB

Send a photo now! 📸
        `, { parse_mode: 'Markdown' });
    });
    
    // ========== স্ট্যাটস কমান্ড ==========
    bot.onText(/\/stats/, (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userImages = Object.values(images).filter(img => img.userId === userId);
        
        bot.sendMessage(chatId, `
📊 *Your Stats*
Total images: ${userImages.length}
Total views: ${userImages.reduce((sum, img) => sum + (img.views || 0), 0)}
        `, { parse_mode: 'Markdown' });
    });
    
    // ========== ফটো হ্যান্ডেল (সবচেয়ে সিম্পল) ==========
    bot.on('photo', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const username = msg.from.username || msg.from.first_name;
        
        console.log(`📸 Photo from ${username}`);
        
        try {
            // ওয়েটিং মেসেজ
            await bot.sendMessage(chatId, '⏳ Processing your image...');
            
            // ফটো ডাউনলোড
            const photo = msg.photo[msg.photo.length - 1];
            const file = await bot.getFile(photo.file_id);
            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
            
            // ফেচ ব্যবহার করে ডাউনলোড
            const response = await fetch(fileUrl);
            const buffer = await response.buffer();
            
            // ইউনিক আইডি
            const imageId = uuidv4();
            const filename = `${imageId}.jpg`;
            
            // বেস64 তে কনভার্ট
            const base64 = buffer.toString('base64');
            const dataUrl = `data:image/jpeg;base64,${base64}`;
            
            // সেভ করা
            images[imageId] = {
                id: imageId,
                userId: userId,
                username: username,
                filename: filename,
                dataUrl: dataUrl,
                views: 0,
                createdAt: new Date().toISOString()
            };
            
            fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
            
            const shareUrl = `${BASE_URL}/share/${imageId}`;
            
            // সাকসেস মেসেজ
            await bot.sendMessage(chatId, `
✅ *Upload Successful!*

🔗 *Your Shareable Link:*
${shareUrl}

📊 Size: ${(file.file_size / 1024).toFixed(2)} KB

Click the link to view and share!
            `, { parse_mode: 'Markdown' });
            
            // লিংক সহ ফটো পাঠান
            await bot.sendPhoto(chatId, shareUrl, {
                caption: `🖼️ Your shared image`
            });
            
            console.log(`✅ Link sent: ${shareUrl}`);
            
        } catch (error) {
            console.error('Photo error:', error);
            await bot.sendMessage(chatId, `
❌ *Upload Failed!*

Error: ${error.message}

Please try again or use /start
            `, { parse_mode: 'Markdown' });
        }
    });
    
    // ========== ডকুমেন্ট হ্যান্ডেল ==========
    bot.on('document', async (msg) => {
        const chatId = msg.chat.id;
        const doc = msg.document;
        
        if (!doc.mime_type || !doc.mime_type.startsWith('image/')) {
            return bot.sendMessage(chatId, '❌ Please send an image file (JPEG, PNG, GIF)');
        }
        
        try {
            await bot.sendMessage(chatId, '⏳ Processing your image...');
            
            const file = await bot.getFile(doc.file_id);
            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
            
            const response = await fetch(fileUrl);
            const buffer = await response.buffer();
            
            const imageId = uuidv4();
            const ext = doc.mime_type.split('/')[1];
            const base64 = buffer.toString('base64');
            const dataUrl = `data:${doc.mime_type};base64,${base64}`;
            
            images[imageId] = {
                id: imageId,
                userId: msg.from.id,
                username: msg.from.username || msg.from.first_name,
                filename: doc.file_name,
                dataUrl: dataUrl,
                mimeType: doc.mime_type,
                views: 0,
                createdAt: new Date().toISOString()
            };
            
            fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
            
            const shareUrl = `${BASE_URL}/share/${imageId}`;
            
            await bot.sendMessage(chatId, `
✅ *Upload Successful!*

🔗 *Your Link:*
${shareUrl}

📄 File: ${doc.file_name}
📊 Size: ${(file.file_size / 1024).toFixed(2)} KB
            `, { parse_mode: 'Markdown' });
            
        } catch (error) {
            console.error('Document error:', error);
            await bot.sendMessage(chatId, '❌ Upload failed! Please try again.');
        }
    });
    
    // এরর হ্যান্ডেলিং
    bot.on('polling_error', (error) => {
        console.log('Polling error:', error.code, error.message);
    });
    
    bot.on('error', (error) => {
        console.log('Bot error:', error.message);
    });
    
} catch (error) {
    console.error('Bot start error:', error.message);
}

// ========== API এন্ডপয়েন্ট ==========

// হেলথ চেক
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        bot: isBotRunning ? 'running' : 'checking',
        imagesCount: Object.keys(images).length
    });
});

// হোম পেজ
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

// শেয়ার লিংক
app.get('/share/:id', (req, res) => {
    const { id } = req.params;
    const image = images[id];
    
    if (!image) {
        return res.status(404).send(`
            <html><body style="text-align:center;padding:50px">
            <h1>❌ Image Not Found</h1>
            <a href="/">Go Home</a>
            </body></html>
        `);
    }
    
    image.views = (image.views || 0) + 1;
    fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
    
    res.send(`
        <html>
        <head>
            <title>Shared Image</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body {
                    font-family: Arial;
                    text-align: center;
                    padding: 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                .card {
                    background: white;
                    border-radius: 20px;
                    padding: 20px;
                    max-width: 90%;
                }
                img {
                    max-width: 100%;
                    max-height: 60vh;
                    border-radius: 10px;
                }
                button {
                    background: #667eea;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    margin: 10px;
                }
            </style>
        </head>
        <body>
            <div class="card">
                <img src="${image.dataUrl}" alt="Image">
                <br><br>
                <button onclick="copyLink()">📋 Copy Link</button>
                <button onclick="window.location.href='/'">🏠 Home</button>
            </div>
            <script>
                function copyLink() {
                    navigator.clipboard.writeText(window.location.href);
                    alert('Link copied!');
                }
            </script>
        </body>
        </html>
    `);
});

// API - ইমেজ ডাটা
app.get('/api/image/:id', (req, res) => {
    const { id } = req.params;
    const image = images[id];
    
    if (!image) {
        return res.status(404).json({ error: 'Not found' });
    }
    
    res.json({
        id: image.id,
        url: `${BASE_URL}/share/${image.id}`,
        username: image.username,
        views: image.views,
        createdAt: image.createdAt
    });
});

// API - সব ইমেজ
app.get('/api/images', (req, res) => {
    const list = Object.values(images).map(img => ({
        id: img.id,
        url: `${BASE_URL}/share/${img.id}`,
        username: img.username,
        views: img.views
    }));
    res.json({ count: list.length, images: list });
});

// আপলোড API
app.post('/api/upload', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image' });
        }
        
        const imageId = uuidv4();
        const base64 = req.file.buffer.toString('base64');
        const dataUrl = `data:${req.file.mimetype};base64,${base64}`;
        
        images[imageId] = {
            id: imageId,
            dataUrl: dataUrl,
            filename: req.file.originalname,
            views: 0,
            createdAt: new Date().toISOString(),
            source: 'api'
        };
        
        fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
        
        res.json({
            success: true,
            shareUrl: `${BASE_URL}/share/${imageId}`,
            apiUrl: `${BASE_URL}/api/image/${imageId}`
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server on port ${PORT}`);
    console.log(`🌐 ${BASE_URL}`);
});

export default app;

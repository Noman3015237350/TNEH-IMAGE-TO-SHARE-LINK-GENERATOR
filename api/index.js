import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ========== কনফিগারেশন ==========
const BASE_URL = 'https://tnehimagetosharelinkgenerator.onrender.com';
const BOT_TOKEN = '8883310302:AAE7E4RXdhErGPJ1om-CLeCeoXSnbbdzQu4';

// ফোল্ডার তৈরি
const publicDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

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

console.log(`📸 Loaded ${Object.keys(images).length} images from database`);

// ========== মিডলওয়্যার ==========
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(publicDir));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ========== টেলিগ্রাম বোট ==========
import fetch from 'node-fetch';

const { default: TelegramBot } = await import('node-telegram-bot-api');

let bot;

try {
    bot = new TelegramBot(BOT_TOKEN, { 
        polling: true,
        request: { timeout: 60000 }
    });
    
    console.log('🤖 Bot starting...');
    
    bot.getMe().then(botInfo => {
        console.log(`✅ Bot @${botInfo.username} is ready!`);
    }).catch(err => {
        console.log('GetMe error:', err.message);
    });
    
    // ========== স্টার্ট ==========
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const name = msg.from.first_name || msg.from.username;
        
        bot.sendMessage(chatId, `
🎉 *Hello ${name}!* 🎉

*TNEH Image Share Bot*
🐘 *Telegram Permanent Storage*

*Features:*
✅ Images stored FOREVER
✅ Original quality
✅ Fast loading
✅ Free unlimited storage

*Commands:*
/start - Welcome
/help - Help
/stats - Your stats
/mylinks - Your uploaded links

*Send me an image now!* 🚀
        `, { parse_mode: 'Markdown' });
    });
    
    // ========== হেল্প ==========
    bot.onText(/\/help/, (msg) => {
        const chatId = msg.chat.id;
        
        bot.sendMessage(chatId, `
📖 *Help Guide - Permanent Storage*

*How it works:*
1. Send image to bot
2. Bot saves to Telegram cloud
3. Get permanent link
4. Share anywhere!

*Benefits:*
• ✅ Never expires
• ✅ Original quality
• ✅ Fast loading
• ✅ Free unlimited storage

*Commands:*
/start - Main menu
/help - This help
/stats - Your statistics
/mylinks - All your images

Send a photo now! 📸
        `, { parse_mode: 'Markdown' });
    });
    
    // ========== মাইলিংকস ==========
    bot.onText(/\/mylinks/, (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const userImages = Object.values(images).filter(img => img.userId === userId);
        
        if (userImages.length === 0) {
            bot.sendMessage(chatId, '📭 *No images found!*\n\nSend me an image to get started.', { parse_mode: 'Markdown' });
        } else {
            let message = `📸 *Your ${userImages.length} Image(s):*\n\n`;
            userImages.slice(-10).reverse().forEach((img, index) => {
                message += `${index + 1}. ${BASE_URL}/share/${img.id}\n`;
            });
            message += `\n💡 Click any link to view/share!`;
            
            bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        }
    });
    
    // ========== স্ট্যাটস ==========
    bot.onText(/\/stats/, (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const userImages = Object.values(images).filter(img => img.userId === userId);
        const totalViews = userImages.reduce((sum, img) => sum + (img.views || 0), 0);
        
        bot.sendMessage(chatId, `
📊 *Your Statistics*

Total uploads: *${userImages.length}*
Total views: *${totalViews}*
Storage: *Telegram Cloud (Permanent)*

✅ Images will NEVER expire!
        `, { parse_mode: 'Markdown' });
    });
    
    // ========== ফটো হ্যান্ডেল ==========
    bot.on('photo', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const username = msg.from.username || msg.from.first_name;
        
        console.log(`📸 Photo from: ${username}`);
        
        try {
            await bot.sendMessage(chatId, '⏳ *Saving to Telegram cloud...*', { 
                parse_mode: 'Markdown' 
            });
            
            // ফটো ডাউনলোড
            const photo = msg.photo[msg.photo.length - 1];
            const file = await bot.getFile(photo.file_id);
            
            // ফাইল ডাউনলোড করে বেস64 তে নিন
            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
            const response = await fetch(fileUrl);
            const buffer = await response.buffer();
            const base64 = buffer.toString('base64');
            const dataUrl = `data:image/jpeg;base64,${base64}`;
            
            // ইউনিক আইডি
            const imageId = uuidv4();
            
            // মেটাডাটা সেভ (বেস64 ডাটা সহ)
            images[imageId] = {
                id: imageId,
                userId: userId,
                username: username,
                dataUrl: dataUrl,
                telegramFileId: photo.file_id,
                views: 0,
                size: file.file_size,
                createdAt: new Date().toISOString(),
                storage: 'telegram'
            };
            
            fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
            
            const shareUrl = `${BASE_URL}/share/${imageId}`;
            
            await bot.sendMessage(chatId, `
✅ *Upload Successful!*

🔗 *Your Permanent Link:*
${shareUrl}

📊 *Size:* ${(file.file_size / 1024).toFixed(2)} KB
💾 *Storage:* Telegram Cloud
⏰ *Expiry:* NEVER

*Share this link - it will work FOREVER!* 🚀
            `, { parse_mode: 'Markdown' });
            
            console.log(`✅ Saved: ${shareUrl}`);
            
        } catch (error) {
            console.error('Photo error:', error);
            await bot.sendMessage(chatId, `
❌ *Upload Failed!*

Error: ${error.message}

Please try again.
            `, { parse_mode: 'Markdown' });
        }
    });
    
    // ========== ডকুমেন্ট হ্যান্ডেল ==========
    bot.on('document', async (msg) => {
        const chatId = msg.chat.id;
        const doc = msg.document;
        
        if (!doc.mime_type || !doc.mime_type.startsWith('image/')) {
            return bot.sendMessage(chatId, '❌ Please send an image file (JPEG, PNG, GIF, WebP)');
        }
        
        try {
            await bot.sendMessage(chatId, '⏳ *Saving to Telegram cloud...*', { parse_mode: 'Markdown' });
            
            const file = await bot.getFile(doc.file_id);
            
            // ফাইল ডাউনলোড
            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
            const response = await fetch(fileUrl);
            const buffer = await response.buffer();
            const base64 = buffer.toString('base64');
            const dataUrl = `data:${doc.mime_type};base64,${base64}`;
            
            const imageId = uuidv4();
            
            images[imageId] = {
                id: imageId,
                userId: msg.from.id,
                username: msg.from.username || msg.from.first_name,
                filename: doc.file_name,
                dataUrl: dataUrl,
                telegramFileId: doc.file_id,
                mimeType: doc.mime_type,
                size: file.file_size,
                views: 0,
                createdAt: new Date().toISOString(),
                storage: 'telegram'
            };
            
            fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
            
            const shareUrl = `${BASE_URL}/share/${imageId}`;
            
            await bot.sendMessage(chatId, `
✅ *Upload Successful!*

🔗 *Your Permanent Link:*
${shareUrl}

📄 *File:* ${doc.file_name}
📊 *Size:* ${(file.file_size / 1024).toFixed(2)} KB
💾 *Storage:* Telegram Cloud (FOREVER)

This image will NEVER expire! 🎉
            `, { parse_mode: 'Markdown' });
            
        } catch (error) {
            console.error('Document error:', error);
            await bot.sendMessage(chatId, '❌ Upload failed! Please try again.');
        }
    });
    
    bot.on('polling_error', (error) => {
        console.log('Polling error:', error.code, error.message);
    });
    
    console.log('✅ Bot with Permanent Storage is ready!');
    
} catch (error) {
    console.error('Bot error:', error.message);
}

// ========== ইমেজ সার্ভ করার API ==========
app.get('/share/:id', (req, res) => {
    const { id } = req.params;
    const image = images[id];
    
    console.log(`🔍 Looking for image: ${id}`);
    console.log(`📸 Available images: ${Object.keys(images).length}`);
    
    if (!image) {
        console.log(`❌ Image not found: ${id}`);
        return res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Image Not Found</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        text-align: center;
                        padding: 50px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        min-height: 100vh;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                    }
                    .card {
                        background: white;
                        border-radius: 20px;
                        padding: 40px;
                        max-width: 400px;
                        margin: 0 auto;
                    }
                    button {
                        background: #667eea;
                        color: white;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 8px;
                        cursor: pointer;
                        margin-top: 20px;
                    }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>❌ Image Not Found</h1>
                    <p>The image you're looking for doesn't exist.</p>
                    <button onclick="window.location.href='/'">Go to Homepage</button>
                </div>
            </body>
            </html>
        `);
    }
    
    // ভিউ আপডেট
    image.views = (image.views || 0) + 1;
    fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
    
    console.log(`✅ Serving image: ${id} - ${image.username} - Views: ${image.views}`);
    
    // HTML পেজ
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${image.username || 'User'}'s Shared Image</title>
            <meta property="og:image" content="${image.dataUrl}">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 20px;
                }
                .container {
                    background: white;
                    border-radius: 20px;
                    padding: 20px;
                    max-width: 90%;
                    text-align: center;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                }
                img {
                    max-width: 100%;
                    max-height: 70vh;
                    border-radius: 10px;
                }
                .info {
                    margin-top: 15px;
                    color: #666;
                    font-size: 14px;
                }
                .storage-badge {
                    display: inline-block;
                    background: #e8f5e9;
                    color: #2e7d32;
                    padding: 5px 10px;
                    border-radius: 20px;
                    font-size: 12px;
                    margin-top: 10px;
                }
                button {
                    background: #667eea;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    margin: 5px;
                    font-size: 14px;
                }
                button:hover {
                    background: #5a67d8;
                }
                input {
                    width: 100%;
                    padding: 10px;
                    margin-top: 15px;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    text-align: center;
                    font-size: 12px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <img src="${image.dataUrl}" alt="Shared Image">
                <div class="info">
                    <p>📸 Shared by: ${image.username || 'Anonymous'}</p>
                    <p>👁️ Views: ${image.views}</p>
                    <p>📅 ${new Date(image.createdAt).toLocaleString()}</p>
                    <div class="storage-badge">
                        💾 Telegram Cloud Storage (Permanent)
                    </div>
                </div>
                <input type="text" id="linkInput" value="${BASE_URL}/share/${image.id}" readonly>
                <button onclick="copyLink()">📋 Copy Link</button>
                <button onclick="downloadImage()">💾 Download</button>
                <button onclick="shareOnWhatsApp()">📱 WhatsApp</button>
                <button onclick="window.location.href='/'">🏠 Home</button>
            </div>
            <script>
                function copyLink() {
                    const input = document.getElementById('linkInput');
                    input.select();
                    document.execCommand('copy');
                    alert('✅ Link copied to clipboard!');
                }
                function downloadImage() {
                    const img = document.querySelector('img');
                    const link = document.createElement('a');
                    link.href = img.src;
                    link.download = '${image.filename || 'image.jpg'}';
                    link.click();
                }
                function shareOnWhatsApp() {
                    const url = window.location.href;
                    window.open('https://wa.me/?text=' + encodeURIComponent('Check out this image: ' + url), '_blank');
                }
            </script>
        </body>
        </html>
    `);
});

// API - সব ইমেজ
app.get('/api/images', (req, res) => {
    const list = Object.values(images).map(img => ({
        id: img.id,
        url: `${BASE_URL}/share/${img.id}`,
        username: img.username,
        views: img.views,
        storage: 'telegram',
        permanent: true,
        createdAt: img.createdAt
    }));
    res.json({ 
        count: list.length, 
        storage: 'Telegram Cloud',
        permanent: true,
        images: list 
    });
});

// API - এক ইমেজ
app.get('/api/image/:id', (req, res) => {
    const image = images[req.params.id];
    if (!image) return res.status(404).json({ error: 'Not found' });
    
    res.json({
        id: image.id,
        url: `${BASE_URL}/share/${image.id}`,
        username: image.username,
        views: image.views,
        storage: 'telegram',
        permanent: true,
        createdAt: image.createdAt
    });
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
            mimeType: req.file.mimetype,
            views: 0,
            createdAt: new Date().toISOString(),
            storage: 'api',
            permanent: true
        };
        
        fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
        
        res.json({
            success: true,
            shareUrl: `${BASE_URL}/share/${imageId}`,
            imageId: imageId
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// হেলথ চেক
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        time: new Date().toISOString(),
        images: Object.keys(images).length,
        storage: 'Telegram Cloud',
        permanent: true
    });
});

// হোম পেজ
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on ${BASE_URL}`);
    console.log(`📸 Total images stored: ${Object.keys(images).length}`);
    console.log(`💾 Storage: Telegram Cloud (Permanent)`);
});

export default app;

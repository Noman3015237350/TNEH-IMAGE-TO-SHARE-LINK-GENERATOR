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
const BOT_TOKEN = process.env.BOT_TOKEN || '8883310302:AAE7E4RXdhErGPJ1om-CLeCeoXSnbbdzQu4';
const BASE_URL = process.env.BASE_URL || 'https://tnehimagetosharelinkgenerator.onrender.com';

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
    images = JSON.parse(fs.readFileSync(dbFile));
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

// Multer সেটআপ
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ========== টেলিগ্রাম বোট ==========
let bot;
try {
    bot = new TelegramBot(BOT_TOKEN, { polling: true });
    console.log('✅ Telegram Bot started successfully');
    
    // বোট কমান্ড
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, `
🎉 *Welcome to Image Share Bot!* 🎉

Send me any image and get a shareable link instantly.

*Commands:*
/start - Welcome message
/help - Help guide
/stats - Your statistics
/website - Open website

Send an image now! 📸
        `, { parse_mode: 'Markdown' });
    });
    
    bot.onText(/\/help/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, `
📖 *How to use:*
1. Send me any image
2. Wait for processing
3. Get your shareable link
4. Share anywhere!

*Supported:* JPEG, PNG, GIF, WebP
        `, { parse_mode: 'Markdown' });
    });
    
    bot.onText(/\/stats/, (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userImages = Object.values(images).filter(img => img.userId === userId);
        
        bot.sendMessage(chatId, `
📊 *Your Stats:*
Total uploads: ${userImages.length}
Total views: ${userImages.reduce((sum, img) => sum + (img.views || 0), 0)}
        `, { parse_mode: 'Markdown' });
    });
    
    bot.onText(/\/website/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, `🌐 Website: ${BASE_URL}`);
    });
    
    // ফটো হ্যান্ডেল
    bot.on('photo', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const username = msg.from.username || msg.from.first_name;
        
        try {
            await bot.sendMessage(chatId, '📤 *Uploading your image...*', { parse_mode: 'Markdown' });
            
            const photo = msg.photo[msg.photo.length - 1];
            const file = await bot.getFile(photo.file_id);
            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
            
            const response = await fetch(fileUrl);
            const buffer = await response.arrayBuffer();
            
            const imageId = uuidv4();
            const filename = `${imageId}.jpg`;
            const filePath = path.join(botUploadsDir, filename);
            fs.writeFileSync(filePath, Buffer.from(buffer));
            
            const base64 = Buffer.from(buffer).toString('base64');
            const dataUrl = `data:image/jpeg;base64,${base64}`;
            
            images[imageId] = {
                id: imageId,
                userId: userId,
                username: username,
                filename: filename,
                dataUrl: dataUrl,
                views: 0,
                createdAt: new Date().toISOString(),
                source: 'telegram'
            };
            fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
            
            const shareUrl = `${BASE_URL}/share/${imageId}`;
            
            await bot.sendMessage(chatId, `
✅ *Image Uploaded Successfully!*

🔗 *Your Shareable Link:*
${shareUrl}

📊 Size: ${(file.file_size / 1024).toFixed(2)} KB

Click the link to view and share! 🚀
            `, { parse_mode: 'Markdown' });
            
            // প্রিভিউ সেন্ড
            await bot.sendPhoto(chatId, shareUrl, {
                caption: `🖼️ Your shared image`
            });
            
        } catch (error) {
            console.error('Bot photo error:', error);
            await bot.sendMessage(chatId, '❌ Upload failed. Please try again.');
        }
    });
    
    // ডকুমেন্ট হ্যান্ডেল
    bot.on('document', async (msg) => {
        const chatId = msg.chat.id;
        const doc = msg.document;
        
        if (!doc.mime_type || !doc.mime_type.startsWith('image/')) {
            return bot.sendMessage(chatId, '❌ Please send an image file (JPEG, PNG, GIF)');
        }
        
        try {
            await bot.sendMessage(chatId, '📤 *Uploading your image...*', { parse_mode: 'Markdown' });
            
            const file = await bot.getFile(doc.file_id);
            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
            
            const response = await fetch(fileUrl);
            const buffer = await response.arrayBuffer();
            
            const imageId = uuidv4();
            const ext = doc.mime_type.split('/')[1];
            const filename = `${imageId}.${ext}`;
            const filePath = path.join(botUploadsDir, filename);
            fs.writeFileSync(filePath, Buffer.from(buffer));
            
            const base64 = Buffer.from(buffer).toString('base64');
            const dataUrl = `data:${doc.mime_type};base64,${base64}`;
            
            images[imageId] = {
                id: imageId,
                userId: msg.from.id,
                username: msg.from.username || msg.from.first_name,
                filename: doc.file_name,
                dataUrl: dataUrl,
                mimeType: doc.mime_type,
                views: 0,
                createdAt: new Date().toISOString(),
                source: 'telegram'
            };
            fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
            
            const shareUrl = `${BASE_URL}/share/${imageId}`;
            
            await bot.sendMessage(chatId, `
✅ *Image Uploaded Successfully!*

🔗 *Shareable Link:*
${shareUrl}

📄 File: ${doc.file_name}
📊 Size: ${(file.file_size / 1024).toFixed(2)} KB
            `, { parse_mode: 'Markdown' });
            
        } catch (error) {
            console.error('Bot document error:', error);
            await bot.sendMessage(chatId, '❌ Upload failed. Please try again.');
        }
    });
    
    bot.on('polling_error', (error) => {
        console.log('Bot polling error:', error.message);
    });
    
} catch (error) {
    console.error('Failed to start bot:', error.message);
}

// ========== API এন্ডপয়েন্ট ==========

// হেলথ চেক
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        bot: bot ? 'running' : 'stopped'
    });
});

// ওয়েবসাইট হোম পেজ
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

// ইমেজ আপলোড API
app.post('/api/upload', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image uploaded' });
        }
        
        const imageId = uuidv4();
        const extension = path.extname(req.file.originalname);
        const filename = `${imageId}${extension}`;
        const base64 = req.file.buffer.toString('base64');
        const dataUrl = `data:${req.file.mimetype};base64,${base64}`;
        
        images[imageId] = {
            id: imageId,
            filename: filename,
            originalName: req.file.originalname,
            dataUrl: dataUrl,
            mimeType: req.file.mimetype,
            size: req.file.size,
            views: 0,
            createdAt: new Date().toISOString(),
            source: 'api'
        };
        
        fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
        
        const shareUrl = `${BASE_URL}/share/${imageId}`;
        
        res.json({
            success: true,
            url: shareUrl,
            imageUrl: shareUrl,
            id: imageId
        });
        
    } catch (error) {
        console.error('API upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// বেস64 আপলোড
app.post('/api/upload-base64', (req, res) => {
    try {
        const { image } = req.body;
        if (!image) {
            return res.status(400).json({ error: 'No image provided' });
        }
        
        const imageId = uuidv4();
        const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        const ext = matches[1].split('/')[1];
        const filename = `${imageId}.${ext}`;
        
        images[imageId] = {
            id: imageId,
            filename: filename,
            dataUrl: image,
            mimeType: matches[1],
            views: 0,
            createdAt: new Date().toISOString(),
            source: 'api'
        };
        
        fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
        
        const shareUrl = `${BASE_URL}/share/${imageId}`;
        
        res.json({
            success: true,
            url: shareUrl,
            id: imageId
        });
        
    } catch (error) {
        console.error('Base64 upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// শেয়ার লিংক ভিউ
app.get('/share/:id', (req, res) => {
    const { id } = req.params;
    const image = images[id];
    
    if (!image) {
        return res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Image Not Found</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>❌ Image Not Found</h1>
                <p>The image doesn't exist or has been removed.</p>
                <a href="/">Go to Homepage</a>
            </body>
            </html>
        `);
    }
    
    // ভিউ আপডেট
    image.views = (image.views || 0) + 1;
    fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Shared Image - ${image.originalName || 'Image'}</title>
            <meta property="og:image" content="${image.dataUrl}">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body {
                    margin: 0;
                    min-height: 100vh;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    font-family: Arial, sans-serif;
                }
                .container {
                    background: white;
                    border-radius: 20px;
                    padding: 20px;
                    max-width: 90%;
                    text-align: center;
                }
                img {
                    max-width: 100%;
                    max-height: 70vh;
                    border-radius: 10px;
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
            <div class="container">
                <img src="${image.dataUrl}" alt="Shared Image">
                <br>
                <button onclick="copyLink()">📋 Copy Share Link</button>
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

// সব ইমেজ লিস্ট
app.get('/api/images', (req, res) => {
    res.json({ images: Object.values(images) });
});

// ========== সার্ভার স্টার্ট ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`🤖 Bot status: ${bot ? 'Running' : 'Stopped'}`);
});

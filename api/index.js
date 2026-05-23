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
const BOT_USERNAME = 'TNEH_Image_Share_Bot'; // আপনার বটের ইউজারনেম

// ফোল্ডার তৈরি
const uploadsDir = path.join(__dirname, '..', 'uploads');
const publicDir = path.join(__dirname, '..', 'public');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
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

console.log(`📸 Loaded ${Object.keys(images).length} images`);

// ========== মিডলওয়্যার ==========
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(publicDir));
app.use('/uploads', express.static(uploadsDir));

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

📸 *How to use:*
Send me any image, I'll give you 2 links:

1️⃣ *Telegram Link* - View directly in Telegram
2️⃣ *Web Link* - Share anywhere on internet

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
📖 *Help Guide*

*Two Types of Links:*

🔗 *Telegram Link:*
\`https://t.me/${BOT_USERNAME}?start=image_ID\`
- View directly in Telegram
- Fast loading
- Native experience

🌐 *Web Link:*
\`${BASE_URL}/share/image_ID\`
- Share anywhere
- Open in browser
- Download option

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
                message += `${index + 1}. *Telegram:* t.me/${BOT_USERNAME}?start=${img.id}\n`;
                message += `   *Web:* ${BASE_URL}/share/${img.id}\n\n`;
            });
            
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

*Link Types:*
• Telegram links: ${userImages.length}
• Web links: ${userImages.length}

Keep sharing! 🎉
        `, { parse_mode: 'Markdown' });
    });
    
    // ========== ডিপ লিংক হ্যান্ডেল (t.me/bot?start=image_id) ==========
    bot.onText(/\/start (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const imageId = match[1];
        const image = images[imageId];
        
        if (!image) {
            return bot.sendMessage(chatId, '❌ Image not found or expired!');
        }
        
        // ভিউ আপডেট
        image.views = (image.views || 0) + 1;
        fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
        
        // ইমেজ দেখান সরাসরি টেলিগ্রামে
        if (image.telegramFileId) {
            // টেলিগ্রাম ফাইল আইডি থাকলে সরাসরি পাঠান
            await bot.sendPhoto(chatId, image.telegramFileId, {
                caption: `
📸 *Image from ${image.username || 'User'}*

🔗 *Web Link:* ${BASE_URL}/share/${imageId}
📊 *Views:* ${image.views}
📅 *Uploaded:* ${new Date(image.createdAt).toLocaleDateString()}

*Share this image anywhere!*
                `,
                parse_mode: 'Markdown'
            });
        } else if (image.dataUrl) {
            // বেস৬৪ ডাটা থাকলে সেটা পাঠান
            await bot.sendPhoto(chatId, image.dataUrl, {
                caption: `
📸 *Image from ${image.username || 'User'}*

🔗 *Web Link:* ${BASE_URL}/share/${imageId}
📊 *Views:* ${image.views}

*Share this link!*
                `,
                parse_mode: 'Markdown'
            });
        }
    });
    
    // ========== ফটো হ্যান্ডেল ==========
    bot.on('photo', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const username = msg.from.username || msg.from.first_name;
        
        console.log(`📸 Photo from: ${username}`);
        
        try {
            await bot.sendMessage(chatId, '⏳ *Processing...*', { parse_mode: 'Markdown' });
            
            // ফটো ডাউনলোড
            const photo = msg.photo[msg.photo.length - 1];
            const file = await bot.getFile(photo.file_id);
            
            // ফাইল ডাউনলোড করে লোকালে সেভ
            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
            const response = await fetch(fileUrl);
            const buffer = await response.buffer();
            const base64 = buffer.toString('base64');
            const dataUrl = `data:image/jpeg;base64,${base64}`;
            
            // লোকাল ফাইল সেভ
            const imageId = uuidv4();
            const localFilename = `${imageId}.jpg`;
            const localPath = path.join(uploadsDir, localFilename);
            fs.writeFileSync(localPath, buffer);
            
            // ডাটাবেসে সেভ
            images[imageId] = {
                id: imageId,
                userId: userId,
                username: username,
                dataUrl: dataUrl,
                localPath: `/uploads/${localFilename}`,
                telegramFileId: photo.file_id,
                views: 0,
                size: file.file_size,
                createdAt: new Date().toISOString(),
                storage: 'both' // টেলিগ্রাম + লোকাল
            };
            
            fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
            
            // দুই ধরনের লিংক
            const telegramLink = `https://t.me/${BOT_USERNAME}?start=${imageId}`;
            const webLink = `${BASE_URL}/share/${imageId}`;
            
            await bot.sendMessage(chatId, `
✅ *Upload Successful!*

*🔗 TWO LINKS GENERATED:*

1️⃣ *Telegram Link* (View in Telegram):
\`${telegramLink}\`

2️⃣ *Web Link* (Share anywhere):
\`${webLink}\`

📊 *Size:* ${(file.file_size / 1024).toFixed(2)} KB
💾 *Storage:* Telegram + Server (Double backup)

*Click Telegram link to view now!* 🚀
            `, { parse_mode: 'Markdown' });
            
            // ইমেজ প্রিভিউ পাঠান
            await bot.sendPhoto(chatId, dataUrl, {
                caption: `🖼️ Your image is ready!\n\n📱 Telegram: ${telegramLink}\n🌐 Web: ${webLink}`
            });
            
            console.log(`✅ Saved: ${imageId}`);
            
        } catch (error) {
            console.error('Photo error:', error);
            await bot.sendMessage(chatId, `❌ Upload Failed! ${error.message}`);
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
            await bot.sendMessage(chatId, '⏳ *Processing...*', { parse_mode: 'Markdown' });
            
            const file = await bot.getFile(doc.file_id);
            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
            const response = await fetch(fileUrl);
            const buffer = await response.buffer();
            const base64 = buffer.toString('base64');
            const dataUrl = `data:${doc.mime_type};base64,${base64}`;
            
            const imageId = uuidv4();
            const ext = doc.mime_type.split('/')[1];
            const localFilename = `${imageId}.${ext}`;
            const localPath = path.join(uploadsDir, localFilename);
            fs.writeFileSync(localPath, buffer);
            
            images[imageId] = {
                id: imageId,
                userId: msg.from.id,
                username: msg.from.username || msg.from.first_name,
                filename: doc.file_name,
                dataUrl: dataUrl,
                localPath: `/uploads/${localFilename}`,
                telegramFileId: doc.file_id,
                mimeType: doc.mime_type,
                size: file.file_size,
                views: 0,
                createdAt: new Date().toISOString(),
                storage: 'both'
            };
            
            fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
            
            const telegramLink = `https://t.me/${BOT_USERNAME}?start=${imageId}`;
            const webLink = `${BASE_URL}/share/${imageId}`;
            
            await bot.sendMessage(chatId, `
✅ *Upload Successful!*

*🔗 TWO LINKS GENERATED:*

1️⃣ *Telegram Link*:
\`${telegramLink}\`

2️⃣ *Web Link*:
\`${webLink}\`

📄 *File:* ${doc.file_name}
📊 *Size:* ${(file.file_size / 1024).toFixed(2)} KB

*Share these links anywhere!* 🎉
            `, { parse_mode: 'Markdown' });
            
        } catch (error) {
            console.error('Document error:', error);
            await bot.sendMessage(chatId, '❌ Upload failed! Please try again.');
        }
    });
    
    bot.on('polling_error', (error) => {
        console.log('Polling error:', error.code, error.message);
    });
    
    console.log('✅ Bot with dual storage is ready!');
    
} catch (error) {
    console.error('Bot error:', error.message);
}

// ========== ওয়েব শেয়ার লিংক ==========
app.get('/share/:id', (req, res) => {
    const { id } = req.params;
    const image = images[id];
    
    if (!image) {
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
                    <p>The image doesn't exist.</p>
                    <button onclick="window.location.href='/'">Go Home</button>
                </div>
            </body>
            </html>
        `);
    }
    
    // ভিউ আপডেট
    image.views = (image.views || 0) + 1;
    fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
    
    const telegramLink = `https://t.me/${BOT_USERNAME}?start=${id}`;
    const imageUrl = image.localPath ? `${BASE_URL}${image.localPath}` : image.dataUrl;
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${image.username || 'User'}'s Shared Image</title>
            <meta property="og:image" content="${imageUrl}">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
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
                    max-height: 60vh;
                    border-radius: 10px;
                }
                .info {
                    margin-top: 15px;
                    color: #666;
                    font-size: 14px;
                }
                .link-box {
                    background: #f5f5f5;
                    padding: 10px;
                    border-radius: 8px;
                    margin: 10px 0;
                    word-break: break-all;
                }
                button {
                    background: #667eea;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    margin: 5px;
                }
                .telegram-btn {
                    background: #0088cc;
                }
                input {
                    width: 100%;
                    padding: 10px;
                    margin-top: 10px;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    text-align: center;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <img src="${imageUrl}" alt="Shared Image">
                <div class="info">
                    <p>📸 Shared by: ${image.username || 'Anonymous'}</p>
                    <p>👁️ Views: ${image.views}</p>
                    <p>📅 ${new Date(image.createdAt).toLocaleString()}</p>
                </div>
                
                <div class="link-box">
                    <strong>📱 Telegram Link:</strong><br>
                    <input type="text" value="${telegramLink}" readonly id="telegramLink">
                    <button onclick="copyTelegramLink()">📋 Copy Telegram Link</button>
                </div>
                
                <div class="link-box">
                    <strong>🌐 Web Link:</strong><br>
                    <input type="text" value="${BASE_URL}/share/${id}" readonly id="webLink">
                    <button onclick="copyWebLink()">📋 Copy Web Link</button>
                </div>
                
                <button class="telegram-btn" onclick="window.open('${telegramLink}', '_blank')">
                    📱 Open in Telegram
                </button>
                <button onclick="downloadImage()">💾 Download</button>
                <button onclick="window.location.href='/'>🏠 Home</button>
            </div>
            <script>
                function copyTelegramLink() {
                    const input = document.getElementById('telegramLink');
                    input.select();
                    document.execCommand('copy');
                    alert('✅ Telegram link copied!');
                }
                function copyWebLink() {
                    const input = document.getElementById('webLink');
                    input.select();
                    document.execCommand('copy');
                    alert('✅ Web link copied!');
                }
                function downloadImage() {
                    const img = document.querySelector('img');
                    const link = document.createElement('a');
                    link.href = img.src;
                    link.download = '${image.filename || 'image.jpg'}';
                    link.click();
                }
            </script>
        </body>
        </html>
    `);
});

// API এন্ডপয়েন্ট
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        time: new Date().toISOString(),
        images: Object.keys(images).length,
        storage: 'Telegram + Local'
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/api/images', (req, res) => {
    const list = Object.values(images).map(img => ({
        id: img.id,
        telegramLink: `https://t.me/${BOT_USERNAME}?start=${img.id}`,
        webLink: `${BASE_URL}/share/${img.id}`,
        username: img.username,
        views: img.views,
        createdAt: img.createdAt
    }));
    res.json({ count: list.length, images: list });
});

app.post('/api/upload', upload.single('image'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image' });
        
        const imageId = uuidv4();
        const ext = path.extname(req.file.originalname);
        const filename = `${imageId}${ext}`;
        const localPath = path.join(uploadsDir, filename);
        fs.writeFileSync(localPath, req.file.buffer);
        
        const base64 = req.file.buffer.toString('base64');
        const dataUrl = `data:${req.file.mimetype};base64,${base64}`;
        
        images[imageId] = {
            id: imageId,
            dataUrl: dataUrl,
            localPath: `/uploads/${filename}`,
            filename: req.file.originalname,
            views: 0,
            createdAt: new Date().toISOString(),
            storage: 'local'
        };
        
        fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
        
        res.json({
            success: true,
            telegramLink: `https://t.me/${BOT_USERNAME}?start=${imageId}`,
            webLink: `${BASE_URL}/share/${imageId}`,
            imageId: imageId
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on ${BASE_URL}`);
    console.log(`📸 Total images: ${Object.keys(images).length}`);
    console.log(`🤖 Bot: t.me/${BOT_USERNAME}`);
});

export default app;

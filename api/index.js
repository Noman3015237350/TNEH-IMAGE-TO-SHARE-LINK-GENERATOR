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

// JSON ডাটাবেস (শুধু মেটাডাটা)
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
let telegramChannelId = '-1003465154233'; // আপনার চ্যানেলের আইডি (নিচে সেটাপ দেখুন)

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
    
    // ========== চ্যানেল সেটাপ হেল্প ==========
    bot.onText(/\/setchannel/, async (msg) => {
        const chatId = msg.chat.id;
        await bot.sendMessage(chatId, `
📢 *How to setup Telegram Storage:*

1. Create a private channel in Telegram
2. Add your bot as admin to the channel
3. Forward any message from channel to bot
4. Bot will auto-detect channel ID

*Current Status:* ${telegramChannelId ? '✅ Configured' : '❌ Not configured'}

Type /getchannel to get channel info
        `, { parse_mode: 'Markdown' });
    });
    
    // ========== ফরোয়ার্ড মেসেজ থেকে চ্যানেল আইডি পাওয়া ==========
    bot.on('channel_post', async (msg) => {
        const channelId = msg.chat.id;
        telegramChannelId = channelId;
        
        // চ্যানেল আইডি সেভ
        fs.writeFileSync('channel_id.txt', channelId.toString());
        
        console.log(`📢 Channel ID saved: ${channelId}`);
    });
    
    // ========== স্টার্ট ==========
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const name = msg.from.first_name || msg.from.username;
        
        bot.sendMessage(chatId, `
🎉 *Hello ${name}!* 🎉

*TNEH Image Share Bot*
🐘 *Now with Telegram Storage!*

*Why Telegram Storage?*
✅ Images stored FOREVER
✅ No expiration
✅ High quality preserved
✅ Free unlimited storage

*How to use:*
Simply send me any photo.

*Commands:*
/start - Welcome
/help - Help
/stats - Your stats
/upload - Upload image
/mylinks - Your uploaded links

*Send me an image now!* 🚀
        `, { parse_mode: 'Markdown' });
    });
    
    // ========== হেল্প ==========
    bot.onText(/\/help/, (msg) => {
        const chatId = msg.chat.id;
        
        bot.sendMessage(chatId, `
📖 *Help Guide - Telegram Storage*

*How it works:*
1. You send an image to bot
2. Bot saves image to Telegram's cloud
3. Image stored FOREVER (free!)
4. You get permanent shareable link

*Benefits of Telegram Storage:*
• ✅ Never expires
• ✅ Original quality
• ✅ Fast loading
• ✅ Free unlimited storage

*Commands:*
/start - Restart bot
/help - This help
/stats - Your statistics
/mylinks - All your uploaded images
/upload - Upload new image

*Website:* ${BASE_URL}

Send a photo now! 📸
        `, { parse_mode: 'Markdown' });
    });
    
    // ========== মাইলিংকস - সব লিংক দেখাবে ==========
    bot.onText(/\/mylinks/, (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        const userImages = Object.values(images).filter(img => img.userId === userId);
        
        if (userImages.length === 0) {
            bot.sendMessage(chatId, '📭 *No images found!*\n\nSend me an image to get started.', { parse_mode: 'Markdown' });
        } else {
            let message = `📸 *Your ${userImages.length} Image(s):*\n\n`;
            userImages.slice(-10).reverse().forEach((img, index) => {
                message += `${index + 1}. [Link](${BASE_URL}/share/${img.id}) - ${new Date(img.createdAt).toLocaleDateString()}\n`;
            });
            message += `\n💡 Click any link to view/share!`;
            
            bot.sendMessage(chatId, message, { parse_mode: 'Markdown', disable_web_page_preview: true });
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
Storage: *Telegram Cloud (unlimited)*

*Storage Type:* ✅ Permanent
*Quality:* ✅ Original
*Expiry:* ❌ Never

Keep sharing! 🎉
        `, { parse_mode: 'Markdown' });
    });
    
    // ========== ফটো হ্যান্ডেল (টেলিগ্রাম স্টোরেজ) ==========
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
            
            // ইউনিক আইডি
            const imageId = uuidv4();
            
            // টেলিগ্রামে ফাইল ফরোয়ার্ড (স্থায়ী স্টোরেজের জন্য)
            let telegramFileId = photo.file_id;
            
            // যদি চ্যানেল থাকে, সেখানে ফরোয়ার্ড করুন
            if (telegramChannelId && telegramChannelId !== '-1001234567890') {
                try {
                    const forwarded = await bot.forwardMessage(telegramChannelId, chatId, msg.message_id);
                    telegramFileId = forwarded.photo[forwarded.photo.length - 1].file_id;
                    console.log(`📤 Forwarded to channel: ${telegramChannelId}`);
                } catch (e) {
                    console.log('Forward failed, using original file_id');
                }
            }
            
            // মেটাডাটা সেভ (শুধু টেলিগ্রাম ফাইল আইডি)
            images[imageId] = {
                id: imageId,
                userId: userId,
                username: username,
                telegramFileId: telegramFileId,
                views: 0,
                size: file.file_size,
                createdAt: new Date().toISOString(),
                storage: 'telegram'
            };
            
            fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
            
            const shareUrl = `${BASE_URL}/share/${imageId}`;
            
            await bot.sendMessage(chatId, `
✅ *Upload Successful! (Telegram Storage)*

🔗 *Your Permanent Link:*
${shareUrl}

📊 *Size:* ${(file.file_size / 1024).toFixed(2)} KB
💾 *Storage:* Telegram Cloud (FOREVER)
⏰ *Expiry:* Never

*Benefits:*
• Image stored permanently
• High quality preserved
• Fast loading
• Free unlimited storage

Share this link - it will work FOREVER! 🚀
            `, { parse_mode: 'Markdown' });
            
            console.log(`✅ Saved with Telegram storage: ${shareUrl}`);
            
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
            const imageId = uuidv4();
            
            let telegramFileId = doc.file_id;
            
            // চ্যানেলে ফরোয়ার্ড
            if (telegramChannelId && telegramChannelId !== '-1001234567890') {
                try {
                    const forwarded = await bot.forwardMessage(telegramChannelId, chatId, msg.message_id);
                    telegramFileId = forwarded.document.file_id;
                } catch (e) {
                    console.log('Forward failed');
                }
            }
            
            images[imageId] = {
                id: imageId,
                userId: msg.from.id,
                username: msg.from.username || msg.from.first_name,
                filename: doc.file_name,
                telegramFileId: telegramFileId,
                mimeType: doc.mime_type,
                size: file.file_size,
                views: 0,
                createdAt: new Date().toISOString(),
                storage: 'telegram'
            };
            
            fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
            
            const shareUrl = `${BASE_URL}/share/${imageId}`;
            
            await bot.sendMessage(chatId, `
✅ *Upload Successful! (Telegram Storage)*

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
    
    console.log('✅ Bot with Telegram Storage is ready!');
    
} catch (error) {
    console.error('Bot error:', error.message);
}

// ========== ইমেজ সার্ভ করার API (টেলিগ্রাম থেকে) ==========
app.get('/share/:id', async (req, res) => {
    const { id } = req.params;
    const image = images[id];
    
    if (!image) {
        return res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Image Not Found</title></head>
            <body style="text-align:center;padding:50px;font-family:Arial">
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
    
    // টেলিগ্রাম থেকে ইমেজ ইউআরএল তৈরি
    const telegramImageUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${
        image.telegramFileId
    }`;
    
    // HTML পেজ
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${image.username || 'User'}'s Shared Image (Telegram Storage)</title>
            <meta property="og:image" content="${telegramImageUrl}">
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
                <img src="${telegramImageUrl}" alt="Shared Image" onerror="this.src='${image.dataUrl || telegramImageUrl}'">
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
            </script>
        </body>
        </html>
    `);
});

// টেলিগ্রাম থেকে সরাসরি ইমেজ সার্ভ
app.get('/telegram-image/:fileId', async (req, res) => {
    const { fileId } = req.params;
    const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileId}`;
    
    try {
        const response = await fetch(url);
        const buffer = await response.buffer();
        res.set('Content-Type', 'image/jpeg');
        res.send(buffer);
    } catch (error) {
        res.status(404).send('Image not found');
    }
});

// ========== অন্যান্য API ==========

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        time: new Date().toISOString(),
        images: Object.keys(images).length,
        storage: 'Telegram Cloud',
        permanent: true
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

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
        telegramFileId: image.telegramFileId,
        createdAt: image.createdAt
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on ${BASE_URL}`);
    console.log(`📸 Total images: ${Object.keys(images).length}`);
    console.log(`💾 Storage: Telegram Cloud (Permanent)`);
});

export default app;

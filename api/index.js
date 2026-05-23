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
let users = {};
const dbFile = path.join(__dirname, '..', 'images.json');
const usersFile = path.join(__dirname, '..', 'users.json');

if (fs.existsSync(dbFile)) {
    try {
        images = JSON.parse(fs.readFileSync(dbFile));
    } catch (e) {
        images = {};
    }
}

if (fs.existsSync(usersFile)) {
    try {
        users = JSON.parse(fs.readFileSync(usersFile));
    } catch (e) {
        users = {};
    }
}

// ========== মিডলওয়্যার ==========
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(publicDir));

// CORS - সবাই ব্যবহার করতে পারবে
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Multer সেটআপ
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ========== টেলিগ্রাম বোট ==========
let bot;
try {
    bot = new TelegramBot(BOT_TOKEN, { 
        polling: true,
        request: { timeout: 60000 }
    });
    
    console.log('✅ Telegram Bot started successfully');
    
    bot.getMe().then(botInfo => {
        console.log(`🤖 Bot @${botInfo.username} is running`);
    });
    
    // ========== বাটন তৈরি ==========
    const mainMenu = {
        reply_markup: {
            keyboard: [
                [{ text: '📸 Upload Image' }, { text: '🔗 Share Link' }],
                [{ text: '📊 My Stats' }, { text: '🌐 Open Website' }],
                [{ text: '❓ Help' }, { text: 'ℹ️ About' }]
            ],
            resize_keyboard: true
        }
    };
    
    const inlineButtons = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📸 Upload Image', callback_data: 'upload_guide' }],
                [{ text: '🔗 Share Your Link', callback_data: 'share_link' }],
                [{ text: '📊 My Stats', callback_data: 'show_stats' }],
                [{ text: '🌐 Open Website', url: BASE_URL }]
            ]
        }
    };
    
    // ========== স্টার্ট কমান্ড ==========
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userName = msg.from.first_name || msg.from.username;
        
        // ইউজার সেভ
        if (!users[userId]) {
            users[userId] = {
                id: userId,
                name: userName,
                username: msg.from.username,
                joinedAt: new Date().toISOString(),
                totalUploads: 0,
                totalViews: 0
            };
            fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
        }
        
        bot.sendMessage(chatId, `
🎉 *Welcome ${userName}!* 🎉

*TNEH Image Share Bot*
Send any image and get instant shareable link!

*Features:*
• 📸 Upload image → Get link
• 🔗 Share link with anyone
• 👥 Others can view via API
• 📊 Track your stats

*Choose an option below:* 👇
        `, {
            parse_mode: 'Markdown',
            ...inlineButtons
        });
        
        bot.sendMessage(chatId, '✨ *Quick Actions:*', {
            parse_mode: 'Markdown',
            ...mainMenu
        });
    });
    
    // ========== ইমেজ আপলোড হ্যান্ডেল ==========
    bot.on('photo', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const username = msg.from.username || msg.from.first_name;
        
        console.log(`📸 Photo received from ${username}`);
        
        try {
            const processingMsg = await bot.sendMessage(chatId, '⏳ *Processing your image...*', {
                parse_mode: 'Markdown'
            });
            
            const photo = msg.photo[msg.photo.length - 1];
            const file = await bot.getFile(photo.file_id);
            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
            
            const response = await fetch(fileUrl);
            const buffer = await response.arrayBuffer();
            
            const imageId = uuidv4();
            const filename = `${imageId}.jpg`;
            const base64 = Buffer.from(buffer).toString('base64');
            const dataUrl = `data:image/jpeg;base64,${base64}`;
            
            // ইমেজ সেভ
            images[imageId] = {
                id: imageId,
                userId: userId,
                username: username,
                filename: filename,
                dataUrl: dataUrl,
                views: 0,
                shares: 0,
                createdAt: new Date().toISOString(),
                source: 'telegram'
            };
            
            // ইউজার আপডেট
            if (users[userId]) {
                users[userId].totalUploads = (users[userId].totalUploads || 0) + 1;
                fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
            }
            
            fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
            
            const shareUrl = `${BASE_URL}/api/image/${imageId}`;
            const viewUrl = `${BASE_URL}/share/${imageId}`;
            
            await bot.deleteMessage(chatId, processingMsg.message_id);
            
            // সাকসেস মেসেজ - লিংকসহ
            await bot.sendPhoto(chatId, shareUrl, {
                caption: `
✅ *Image Uploaded Successfully!*

🔗 *Your Shareable Link:*
\`${shareUrl}\`

👁️ *View Link:*
\`${viewUrl}\`

📊 *Size:* ${(file.file_size / 1024).toFixed(2)} KB

💡 *Share this link with anyone!*
They can view the image without Telegram.
                `,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔗 Copy Link', callback_data: `copy_${shareUrl}` }],
                        [{ text: '👁️ View Image', url: viewUrl }],
                        [{ text: '📤 Share on WhatsApp', callback_data: `whatsapp_${shareUrl}` }],
                        [{ text: '📸 Upload Another', callback_data: 'upload_guide' }]
                    ]
                }
            });
            
            console.log(`✅ Upload successful: ${shareUrl}`);
            
        } catch (error) {
            console.error('❌ Bot photo error:', error);
            await bot.sendMessage(chatId, `
❌ *Upload Failed!*

Error: ${error.message}

Please try again.
            `, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔄 Try Again', callback_data: 'upload_guide' }]
                    ]
                }
            });
        }
    });
    
    // ========== ডকুমেন্ট হ্যান্ডেল ==========
    bot.on('document', async (msg) => {
        const chatId = msg.chat.id;
        const doc = msg.document;
        
        if (!doc.mime_type || !doc.mime_type.startsWith('image/')) {
            return bot.sendMessage(chatId, '❌ Please send an image file!', {
                reply_markup: {
                    inline_keyboard: [[{ text: '📸 Send Image', callback_data: 'upload_guide' }]]
                }
            });
        }
        
        try {
            await bot.sendMessage(chatId, '⏳ *Processing...*', { parse_mode: 'Markdown' });
            
            const file = await bot.getFile(doc.file_id);
            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
            
            const response = await fetch(fileUrl);
            const buffer = await response.arrayBuffer();
            
            const imageId = uuidv4();
            const ext = doc.mime_type.split('/')[1];
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
                shares: 0,
                createdAt: new Date().toISOString(),
                source: 'telegram'
            };
            
            fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
            
            const shareUrl = `${BASE_URL}/api/image/${imageId}`;
            const viewUrl = `${BASE_URL}/share/${imageId}`;
            
            await bot.sendMessage(chatId, `
✅ *Upload Successful!*

🔗 *API Link (for developers):*
\`${shareUrl}\`

👁️ *View Link (for everyone):*
\`${viewUrl}\`

📄 *File:* ${doc.file_name}
📊 *Size:* ${(file.file_size / 1024).toFixed(2)} KB

*Anyone can access this image via API!*
            `, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔗 Copy API Link', callback_data: `copy_${shareUrl}` }],
                        [{ text: '👁️ View Image', url: viewUrl }],
                        [{ text: '📸 Upload More', callback_data: 'upload_guide' }]
                    ]
                }
            });
            
        } catch (error) {
            console.error('Document error:', error);
            await bot.sendMessage(chatId, '❌ Upload failed!');
        }
    });
    
    // ========== টেক্সট মেসেজ হ্যান্ডেল ==========
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;
        
        if (!msg.photo && !msg.document && text) {
            if (text === '📸 Upload Image') {
                await bot.sendMessage(chatId, '📸 *Send me your image now!*', { parse_mode: 'Markdown' });
            }
            else if (text === '🔗 Share Link') {
                await bot.sendMessage(chatId, `
🔗 *Share Your Image Link*

1. Upload an image first
2. Copy the link I give you
3. Share it anywhere!

*Recent uploads:* ${Object.values(images).filter(img => img.userId === msg.from.id).length}
                `, { parse_mode: 'Markdown' });
            }
            else if (text === '📊 My Stats') {
                const userId = msg.from.id;
                const userImages = Object.values(images).filter(img => img.userId === userId);
                const totalViews = userImages.reduce((sum, img) => sum + (img.views || 0), 0);
                
                await bot.sendMessage(chatId, `
📊 *Your Statistics*

• Total Images: *${userImages.length}*
• Total Views: *${totalViews}*
• Total Shares: *${userImages.reduce((sum, img) => sum + (img.shares || 0), 0)}*

*Recent Images:*
${userImages.slice(-3).reverse().map(img => `• ${img.createdAt.substring(0, 10)} - ${BASE_URL}/api/image/${img.id.substring(0, 8)}...`).join('\n')}
                `, { parse_mode: 'Markdown' });
            }
            else if (text === '🌐 Open Website') {
                await bot.sendMessage(chatId, `🌐 ${BASE_URL}`);
            }
            else if (text === '❓ Help') {
                await bot.sendMessage(chatId, `
❓ *Help Guide*

*Commands:*
/start - Main menu
/stats - Your statistics

*How to use API:*
GET ${BASE_URL}/api/image/{id}
→ Returns image data in JSON

*Example:*
${BASE_URL}/api/image/your-image-id
                `, { parse_mode: 'Markdown' });
            }
        }
    });
    
    // ========== কলব্যাক কোয়েরি ==========
    bot.on('callback_query', async (callbackQuery) => {
        const message = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = message.chat.id;
        
        bot.answerCallbackQuery(callbackQuery.id);
        
        if (data === 'upload_guide') {
            await bot.sendMessage(chatId, '📸 *Send me an image now!*\n\nJust tap the attachment button 📎', {
                parse_mode: 'Markdown'
            });
        }
        else if (data === 'share_link') {
            const userId = callbackQuery.from.id;
            const userImages = Object.values(images).filter(img => img.userId === userId);
            
            if (userImages.length === 0) {
                await bot.sendMessage(chatId, '❌ *No images found!*\n\nUpload an image first.', {
                    parse_mode: 'Markdown'
                });
            } else {
                const latest = userImages[userImages.length - 1];
                const shareUrl = `${BASE_URL}/api/image/${latest.id}`;
                await bot.sendMessage(chatId, `
🔗 *Your Latest Image Link:*
\`${shareUrl}\`

Share this with anyone! They can view it via API or browser.
                `, { parse_mode: 'Markdown' });
            }
        }
        else if (data === 'show_stats') {
            const userId = callbackQuery.from.id;
            const userImages = Object.values(images).filter(img => img.userId === userId);
            
            await bot.sendMessage(chatId, `
📊 *Your Stats*
Uploads: ${userImages.length}
Views: ${userImages.reduce((sum, img) => sum + (img.views || 0), 0)}
            `, { parse_mode: 'Markdown' });
        }
        else if (data.startsWith('copy_')) {
            const url = data.replace('copy_', '');
            await bot.sendMessage(chatId, `✅ *Link copied!*\n\n\`${url}\``, { parse_mode: 'Markdown' });
        }
        else if (data.startsWith('whatsapp_')) {
            const url = data.replace('whatsapp_', '');
            const whatsappUrl = `https://wa.me/?text=Check out this image: ${encodeURIComponent(url)}`;
            await bot.sendMessage(chatId, `📱 *Share on WhatsApp:*\n${whatsappUrl}`, { parse_mode: 'Markdown' });
        }
    });
    
    bot.on('polling_error', (error) => {
        console.log('Polling error:', error.message);
    });
    
} catch (error) {
    console.error('Failed to start bot:', error.message);
}

// ========== API এন্ডপয়েন্ট (সবার জন্য ওপেন) ==========

// হেলথ চেক
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        bot: bot ? 'running' : 'stopped',
        totalImages: Object.keys(images).length,
        totalUsers: Object.keys(users).length
    });
});

// API - সব ইমেজের লিস্ট (পাবলিক)
app.get('/api/images', (req, res) => {
    const imageList = Object.values(images).map(img => ({
        id: img.id,
        url: `${BASE_URL}/api/image/${img.id}`,
        viewUrl: `${BASE_URL}/share/${img.id}`,
        username: img.username,
        views: img.views,
        createdAt: img.createdAt
    }));
    res.json({ 
        success: true, 
        count: imageList.length,
        images: imageList 
    });
});

// API - সিঙ্গেল ইমেজ ডিটেইলস (পাবলিক)
app.get('/api/image/:id', (req, res) => {
    const { id } = req.params;
    const image = images[id];
    
    if (!image) {
        return res.status(404).json({ 
            success: false, 
            error: 'Image not found' 
        });
    }
    
    // ভিউ কাউন্ট আপডেট
    image.views = (image.views || 0) + 1;
    fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
    
    res.json({
        success: true,
        image: {
            id: image.id,
            url: `${BASE_URL}/api/image/${image.id}`,
            viewUrl: `${BASE_URL}/share/${image.id}`,
            dataUrl: image.dataUrl,
            mimeType: image.mimeType || 'image/jpeg',
            filename: image.filename || 'image.jpg',
            username: image.username,
            views: image.views,
            shares: image.shares || 0,
            createdAt: image.createdAt
        }
    });
});

// API - ইউজারের ইমেজ
app.get('/api/user/:userId/images', (req, res) => {
    const { userId } = req.params;
    const userImages = Object.values(images).filter(img => img.userId == userId);
    
    res.json({
        success: true,
        count: userImages.length,
        images: userImages.map(img => ({
            id: img.id,
            url: `${BASE_URL}/api/image/${img.id}`,
            views: img.views,
            createdAt: img.createdAt
        }))
    });
});

// ওয়েব ভিউ - ইমেজ দেখানোর জন্য HTML পেজ
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
                        color: white;
                    }
                    .container {
                        background: white;
                        color: black;
                        border-radius: 20px;
                        padding: 40px;
                        max-width: 500px;
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
                <div class="container">
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
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${image.username || 'User'}'s Shared Image</title>
            <meta property="og:image" content="${image.dataUrl}">
            <meta property="og:title" content="Shared Image">
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
                    max-height: 70vh;
                    border-radius: 10px;
                }
                .info {
                    margin-top: 15px;
                    color: #666;
                    font-size: 14px;
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
                .api-link {
                    background: #f5f5f5;
                    padding: 10px;
                    border-radius: 8px;
                    margin-top: 15px;
                    font-size: 12px;
                    word-break: break-all;
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
                </div>
                <button onclick="copyLink()">📋 Copy Link</button>
                <button onclick="downloadImage()">💾 Download</button>
                <button onclick="shareOnWhatsApp()">📱 WhatsApp</button>
                <div class="api-link">
                    🔗 <strong>API Endpoint:</strong><br>
                    <code>${BASE_URL}/api/image/${image.id}</code>
                </div>
            </div>
            <script>
                function copyLink() {
                    navigator.clipboard.writeText(window.location.href);
                    alert('✅ Link copied!');
                }
                function downloadImage() {
                    const link = document.createElement('a');
                    link.href = '${image.dataUrl}';
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

// ফ্রন্টেন্ড হোম পেজ
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

// আপলোড API
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
            shares: 0,
            createdAt: new Date().toISOString(),
            source: 'api',
            username: req.body.username || 'Anonymous'
        };
        
        fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
        
        const apiUrl = `${BASE_URL}/api/image/${imageId}`;
        const viewUrl = `${BASE_URL}/share/${imageId}`;
        
        res.json({ 
            success: true, 
            apiUrl: apiUrl,
            viewUrl: viewUrl,
            id: imageId 
        });
    } catch (error) {
        console.error('API upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 URL: ${BASE_URL}`);
    console.log(`📡 API Endpoint: ${BASE_URL}/api/images`);
    console.log(`🤖 Bot is running`);
});

export default app;

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

// ========== টেলিগ্রাম বোট (পুরোপুরি ফিক্সড) ==========
import fetch from 'node-fetch';

const BOT_TOKEN = '8883310302:AAE7E4RXdhErGPJ1om-CLeCeoXSnbbdzQu4';

// ডায়নামিক ইম্পোর্ট
const { default: TelegramBot } = await import('node-telegram-bot-api');

let bot;

try {
    bot = new TelegramBot(BOT_TOKEN, { 
        polling: true,
        request: { timeout: 60000 }
    });
    
    console.log('🤖 Bot initializing...');
    
    bot.getMe().then(botInfo => {
        console.log(`✅ Bot @${botInfo.username} is running!`);
    }).catch(err => {
        console.log('GetMe error:', err.message);
    });
    
    // ========== স্টার্ট ==========
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const name = msg.from.first_name || msg.from.username;
        
        bot.sendMessage(chatId, `
🎉 *Hello ${name}!* 🎉

Welcome to *TNEH Image Share Bot*

📸 *How to use:*
Just send me any photo.

I will give you a permanent shareable link!

*Commands:*
/start - Welcome
/help - Help guide
/stats - Your stats

*Send me an image now!* 🚀
        `, { parse_mode: 'Markdown' });
    });
    
    // ========== হেল্প ==========
    bot.onText(/\/help/, (msg) => {
        const chatId = msg.chat.id;
        
        bot.sendMessage(chatId, `
📖 *Help Guide*

*Steps:*
1. Send me any photo
2. Wait a moment
3. Get your shareable link

*Supported:* All image formats
*Size limit:* 10MB

*Website:* ${BASE_URL}

Send a photo now! 📸
        `, { parse_mode: 'Markdown' });
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

Keep sharing! 🎉
        `, { parse_mode: 'Markdown' });
    });
    
    // ========== ফটো হ্যান্ডেল (সবচেয়ে সিম্পল) ==========
    bot.on('photo', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const username = msg.from.username || msg.from.first_name;
        
        console.log(`📸 Photo from: ${username}`);
        
        try {
            // ওয়েটিং মেসেজ
            const waitMsg = await bot.sendMessage(chatId, '⏳ *Processing your image...*', { 
                parse_mode: 'Markdown' 
            });
            
            // ফটো ডাউনলোড
            const photo = msg.photo[msg.photo.length - 1];
            const file = await bot.getFile(photo.file_id);
            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
            
            const response = await fetch(fileUrl);
            const buffer = await response.buffer();
            
            // ইউনিক আইডি
            const imageId = uuidv4();
            const filename = `${imageId}.jpg`;
            
            // বেস64 তে কনভার্ট
            const base64 = buffer.toString('base64');
            const dataUrl = `data:image/jpeg;base64,${base64}`;
            
            // JSON এ সেভ
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
            
            // ওয়েটিং মেসেজ ডিলিট
            await bot.deleteMessage(chatId, waitMsg.message_id);
            
            // শুধু টেক্সট মেসেজ (ফটো ছাড়া)
            await bot.sendMessage(chatId, `
✅ *Upload Successful!*

🔗 *Your Shareable Link:*
\`${shareUrl}\`

📊 *Size:* ${(file.file_size / 1024).toFixed(2)} KB
👁️ *Views:* 0

💡 *Click the link to view and share!*

*Quick actions:*
• Copy the link
• Share anywhere
• Anyone can view
            `, { parse_mode: 'Markdown' });
            
            console.log(`✅ Success: ${shareUrl}`);
            
        } catch (error) {
            console.error('Photo error:', error);
            await bot.sendMessage(chatId, `
❌ *Upload Failed!*

Error: ${error.message}

Please try again or send a different image.
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
            const waitMsg = await bot.sendMessage(chatId, '⏳ *Processing...*', { parse_mode: 'Markdown' });
            
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
                views: 0,
                createdAt: new Date().toISOString()
            };
            
            fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
            
            const shareUrl = `${BASE_URL}/share/${imageId}`;
            
            await bot.deleteMessage(chatId, waitMsg.message_id);
            
            await bot.sendMessage(chatId, `
✅ *Upload Successful!*

🔗 *Your Link:*
\`${shareUrl}\`

📄 *File:* ${doc.file_name}
📊 *Size:* ${(file.file_size / 1024).toFixed(2)} KB

Share this link! 🚀
            `, { parse_mode: 'Markdown' });
            
        } catch (error) {
            console.error('Document error:', error);
            await bot.sendMessage(chatId, '❌ Upload failed! Try again.');
        }
    });
    
    // এরর হ্যান্ডেলিং
    bot.on('polling_error', (error) => {
        console.log('Polling error:', error.code, error.message);
    });
    
    console.log('✅ Bot ready!');
    
} catch (error) {
    console.error('Bot error:', error.message);
}

// ========== API ==========

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        time: new Date().toISOString(),
        images: Object.keys(images).length
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

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
        <!DOCTYPE html>
        <html>
        <head>
            <title>Shared Image</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                *{margin:0;padding:0;box-sizing:border-box;}
                body {
                    font-family: Arial, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 20px;
                }
                .card {
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
                button {
                    background: #667eea;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    margin: 5px;
                }
                input {
                    width: 100%;
                    padding: 10px;
                    margin-top: 15px;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    text-align: center;
                }
            </style>
        </head>
        <body>
            <div class="card">
                <img src="${image.dataUrl}" alt="Image">
                <div style="margin-top:15px;color:#666;">
                    <p>📸 ${image.username || 'Anonymous'}</p>
                    <p>👁️ ${image.views} views</p>
                </div>
                <input type="text" id="link" value="${BASE_URL}/share/${id}" readonly>
                <button onclick="copyLink()">📋 Copy</button>
                <button onclick="download()">💾 Download</button>
                <button onclick="window.location.href='/'">🏠 Home</button>
            </div>
            <script>
                function copyLink() {
                    const input = document.getElementById('link');
                    input.select();
                    document.execCommand('copy');
                    alert('Link copied!');
                }
                function download() {
                    const link = document.createElement('a');
                    link.href = '${image.dataUrl}';
                    link.download = '${image.filename || 'image.jpg'}';
                    link.click();
                }
            </script>
        </body>
        </html>
    `);
});

app.get('/api/images', (req, res) => {
    const list = Object.values(images).map(img => ({
        id: img.id,
        url: `${BASE_URL}/share/${img.id}`,
        username: img.username,
        views: img.views
    }));
    res.json({ count: list.length, images: list });
});

app.get('/api/image/:id', (req, res) => {
    const image = images[req.params.id];
    if (!image) return res.status(404).json({ error: 'Not found' });
    res.json({
        id: image.id,
        url: `${BASE_URL}/share/${image.id}`,
        username: image.username,
        views: image.views
    });
});

app.post('/api/upload', upload.single('image'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image' });
        
        const imageId = uuidv4();
        const base64 = req.file.buffer.toString('base64');
        const dataUrl = `data:${req.file.mimetype};base64,${base64}`;
        
        images[imageId] = {
            id: imageId,
            dataUrl: dataUrl,
            filename: req.file.originalname,
            views: 0,
            createdAt: new Date().toISOString()
        };
        
        fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
        
        res.json({
            success: true,
            shareUrl: `${BASE_URL}/share/${imageId}`
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server: ${BASE_URL}`);
    console.log(`📸 Total images: ${Object.keys(images).length}`);
});

export default app;

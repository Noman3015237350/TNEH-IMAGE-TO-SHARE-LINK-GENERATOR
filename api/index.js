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

// ========== টেলিগ্রাম বোট (বাটন সহ) ==========
let bot;
try {
    bot = new TelegramBot(BOT_TOKEN, { polling: true });
    console.log('✅ Telegram Bot started successfully');
    
    // মেইন মেনু বাটন
    const mainMenu = {
        reply_markup: {
            keyboard: [
                [{ text: '📸 Upload Image' }, { text: '📊 My Stats' }],
                [{ text: '🌐 Open Website' }, { text: '❓ Help' }],
                [{ text: 'ℹ️ About' }]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };
    
    // ইনলাইন বাটন (মেসেজের ভিতরে)
    const inlineButtons = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '📸 Upload Image', callback_data: 'upload_guide' },
                    { text: '📊 My Stats', callback_data: 'show_stats' }
                ],
                [
                    { text: '🌐 Open Website', url: BASE_URL },
                    { text: '🔗 Share Bot', callback_data: 'share_bot' }
                ],
                [
                    { text: '❓ Help', callback_data: 'help_guide' },
                    { text: 'ℹ️ About', callback_data: 'about_bot' }
                ]
            ]
        }
    };
    
    // স্টার্ট কমান্ড - বাটন সহ
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const userName = msg.from.first_name || msg.from.username;
        
        bot.sendMessage(chatId, `
🎉 *Welcome ${userName}!* 🎉

*TNEH Image Share Bot*
Generate instant shareable links from your images.

*What can you do?*
• 📸 Send any image
• 🔗 Get shareable link
• 🌐 Share anywhere

*Choose an option below:* 👇
        `, {
            parse_mode: 'Markdown',
            ...inlineButtons
        });
        
        // কাস্টম কিবোর্ডও দেখান
        bot.sendMessage(chatId, '✨ *Quick Actions:*', {
            parse_mode: 'Markdown',
            ...mainMenu
        });
    });
    
    // হেল্প কমান্ড
    bot.onText(/\/help/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, `
❓ *Help Guide*

*How to use:*
1️⃣ Send me any image (photo or file)
2️⃣ Wait for upload (2-3 seconds)
3️⃣ Get your shareable link
4️⃣ Copy and share anywhere!

*Commands:*
/start - Main menu
/help - This guide
/stats - Your statistics
/website - Open web version

*Supported formats:* JPEG, PNG, GIF, WebP

*Tips:* Send high-quality images for best results!
        `, {
            parse_mode: 'Markdown',
            ...inlineButtons
        });
    });
    
    // স্ট্যাটস কমান্ড
    bot.onText(/\/stats/, (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const userImages = Object.values(images).filter(img => img.userId === userId);
        const totalViews = userImages.reduce((sum, img) => sum + (img.views || 0), 0);
        
        const statsMessage = userImages.length === 0 ? 
            `📊 *No uploads yet!*\n\nSend me an image to get started. 🚀` :
            `
📊 *Your Statistics*

• Total Images: *${userImages.length}*
• Total Views: *${totalViews}*
• Average Views: *${userImages.length > 0 ? (totalViews / userImages.length).toFixed(1) : 0}*

*Recent Uploads:*
${userImages.slice(-3).reverse().map(img => `• ${new Date(img.createdAt).toLocaleDateString()}`).join('\n')}

Keep sharing! 🎉
            `;
        
        bot.sendMessage(chatId, statsMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📸 Upload New Image', callback_data: 'upload_guide' }],
                    [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                ]
            }
        });
    });
    
    // ওয়েবসাইট কমান্ড
    bot.onText(/\/website/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, `
🌐 *TNEH Image Share Website*

${BASE_URL}

*Features:*
• Drag & drop upload
• QR code generator
• Image gallery
• Shareable links

Click the button below to open! 👇
        `, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🌐 Open Website', url: BASE_URL }],
                    [{ text: '📸 Try Bot', callback_data: 'upload_guide' }]
                ]
            }
        });
    });
    
    // ফটো হ্যান্ডেল
    bot.on('photo', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const username = msg.from.username || msg.from.first_name;
        
        // সেন্ডিং ইন্ডিকেটর
        await bot.sendChatAction(chatId, 'upload_photo');
        
        try {
            const waitMsg = await bot.sendMessage(chatId, '⏳ *Processing your image...*', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '⏳ Uploading...', callback_data: 'loading' }]]
                }
            });
            
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
            
            // ডিলিট ওয়েটিং মেসেজ
            bot.deleteMessage(chatId, waitMsg.message_id);
            
            // সাকসেস মেসেজ বাটন সহ
            await bot.sendPhoto(chatId, shareUrl, {
                caption: `
✅ *Upload Successful!*

🔗 *Your Shareable Link:*
\`${shareUrl}\`

📊 *Stats:*
• Size: ${(file.file_size / 1024).toFixed(2)} KB
• ID: \`${imageId.slice(0, 8)}\`

💡 Click the link to view and share!
                `,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔗 Copy Link', callback_data: `copy_${shareUrl}` }],
                        [{ text: '📤 Share', callback_data: `share_${shareUrl}` }],
                        [{ text: '📸 Upload Another', callback_data: 'upload_guide' }],
                        [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                    ]
                }
            });
            
        } catch (error) {
            console.error('Bot photo error:', error);
            await bot.sendMessage(chatId, '❌ *Upload Failed!*\n\nPlease try again or use /start', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔄 Try Again', callback_data: 'upload_guide' }],
                        [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                    ]
                }
            });
        }
    });
    
    // ডকুমেন্ট হ্যান্ডেল
    bot.on('document', async (msg) => {
        const chatId = msg.chat.id;
        const doc = msg.document;
        
        if (!doc.mime_type || !doc.mime_type.startsWith('image/')) {
            return bot.sendMessage(chatId, '❌ *Please send an image file!*\n\nSupported: JPEG, PNG, GIF, WebP', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📸 Send Image', callback_data: 'upload_guide' }],
                        [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                    ]
                }
            });
        }
        
        await bot.sendChatAction(chatId, 'upload_document');
        
        try {
            await bot.sendMessage(chatId, '⏳ *Uploading your image...*', { parse_mode: 'Markdown' });
            
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
✅ *Upload Successful!*

🔗 *Your Shareable Link:*
\`${shareUrl}\`

📄 *File:* ${doc.file_name}
📊 *Size:* ${(file.file_size / 1024).toFixed(2)} KB

*Quick Actions:* 👇
            `, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔗 Copy Link', callback_data: `copy_${shareUrl}` }],
                        [{ text: '🌐 Open in Browser', url: shareUrl }],
                        [{ text: '📸 Upload More', callback_data: 'upload_guide' }]
                    ]
                }
            });
            
        } catch (error) {
            console.error('Bot document error:', error);
            await bot.sendMessage(chatId, '❌ *Upload Failed!*\n\nPlease try again.', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔄 Retry', callback_data: 'upload_guide' }]
                    ]
                }
            });
        }
    });
    
    // ========== কলব্যাক কোয়েরি হ্যান্ডেলার (বাটন ক্লিক) ==========
    bot.on('callback_query', async (callbackQuery) => {
        const message = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = message.chat.id;
        
        // ইউজারকে জানান যে বাটন প্রেস হয়েছে
        bot.answerCallbackQuery(callbackQuery.id);
        
        if (data === 'main_menu') {
            await bot.sendMessage(chatId, '🏠 *Main Menu*\n\nChoose an option below:', {
                parse_mode: 'Markdown',
                ...inlineButtons
            });
        }
        
        else if (data === 'upload_guide') {
            await bot.sendMessage(chatId, `
📸 *How to upload:*

*Method 1:* Send me a photo directly
*Method 2:* Send as document (original quality)
*Method 3:* Use website for advanced features

*Tips:*
• Send high-quality images
• Supported: JPEG, PNG, GIF, WebP
• Max size: 10MB

Ready? Send me an image now! 🚀
            `, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🌐 Open Website', url: BASE_URL }],
                        [{ text: '🏠 Back to Menu', callback_data: 'main_menu' }]
                    ]
                }
            });
        }
        
        else if (data === 'show_stats') {
            const userId = callbackQuery.from.id;
            const userImages = Object.values(images).filter(img => img.userId === userId);
            const totalViews = userImages.reduce((sum, img) => sum + (img.views || 0), 0);
            
            const statsMsg = userImages.length === 0 ?
                `📊 *No uploads yet!*\n\nSend me an image to get started. 🚀` :
                `
📊 *Your Statistics*

• Total Images: *${userImages.length}*
• Total Views: *${totalViews}*
• Storage Used: *${(userImages.reduce((sum, img) => sum + (img.size || 0), 0) / 1024 / 1024).toFixed(2)} MB*

*Recent Activity:*
${userImages.slice(-5).reverse().map(img => `• ${new Date(img.createdAt).toLocaleString()}`).join('\n')}
                `;
            
            await bot.sendMessage(chatId, statsMsg, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔄 Refresh', callback_data: 'show_stats' }],
                        [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                    ]
                }
            });
        }
        
        else if (data === 'help_guide') {
            await bot.sendMessage(chatId, `
❓ *Help & Support*

*Commands:*
/start - Main menu
/help - Help guide
/stats - Your stats
/website - Open website

*Features:*
• Instant shareable links
• No registration
• Free to use
• Permanent storage

*Need more help?* Visit our website or contact support.
            `, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🌐 Website', url: BASE_URL }],
                        [{ text: '📸 Try Now', callback_data: 'upload_guide' }],
                        [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                    ]
                }
            });
        }
        
        else if (data === 'about_bot') {
            await bot.sendMessage(chatId, `
ℹ️ *About TNEH Image Share Bot*

*Version:* 1.0.0
*Developer:* TNEH
*Platform:* Telegram + Web

*Features:*
• 📸 Instant image upload
• 🔗 Shareable link generation
• 📊 Usage statistics
• 🌐 Web interface
• 💾 Permanent storage

*Website:* ${BASE_URL}

Thanks for using our bot! 🎉
            `, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⭐ Rate Bot', callback_data: 'rate_bot' }],
                        [{ text: '📸 Start Sharing', callback_data: 'upload_guide' }],
                        [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                    ]
                }
            });
        }
        
        else if (data === 'share_bot') {
            const botUsername = (await bot.getMe()).username;
            await bot.sendMessage(chatId, `
🔗 *Share This Bot*

Invite your friends!

*Bot Link:*
\`https://t.me/${botUsername}\`

*Website:*
${BASE_URL}

Share and earn more features! 🎁
            `, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📤 Share Bot', switch_inline_query: 'Check out this awesome bot!' }],
                        [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                    ]
                }
            });
        }
        
        else if (data === 'rate_bot') {
            await bot.sendMessage(chatId, `
⭐ *Rate Our Bot*

Loving our bot? Rate us 5 stars!

Your feedback helps us improve! 💪

*Suggestions?* Send us your feedback.
            `, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⭐ ⭐ ⭐ ⭐ ⭐', callback_data: 'rate_5' }],
                        [{ text: '📝 Send Feedback', callback_data: 'feedback' }],
                        [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
                    ]
                }
            });
        }
        
        else if (data === 'rate_5') {
            await bot.sendMessage(chatId, '🎉 *Thank you for 5 stars!*\n\nWe appreciate your support! ❤️', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '🏠 Main Menu', callback_data: 'main_menu' }]]
                }
            });
        }
        
        else if (data.startsWith('copy_')) {
            const url = data.replace('copy_', '');
            await bot.sendMessage(chatId, `🔗 *Link ready to copy!*\n\n\`${url}\``, {
                parse_mode: 'Markdown'
            });
        }
        
        else if (data === 'loading') {
            await bot.sendMessage(chatId, '⏳ *Please wait while your image is being processed...*', {
                parse_mode: 'Markdown'
            });
        }
    });
    
    // টেক্সট মেসেজ হ্যান্ডেল (কিবোর্ড বাটনের জন্য)
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;
        
        // ইমেজ না হলে টেক্সট চেক করুন
        if (!msg.photo && !msg.document && text) {
            if (text === '📸 Upload Image') {
                await bot.sendMessage(chatId, '📸 *Send me your image now!*\n\nJust tap the attachment button 📎 and select a photo.', {
                    parse_mode: 'Markdown'
                });
            }
            else if (text === '📊 My Stats') {
                bot.emit('text', { ...msg, text: '/stats' });
            }
            else if (text === '🌐 Open Website') {
                bot.emit('text', { ...msg, text: '/website' });
            }
            else if (text === '❓ Help') {
                bot.emit('text', { ...msg, text: '/help' });
            }
            else if (text === 'ℹ️ About') {
                bot.emit('callback_query', {
                    message: msg,
                    data: 'about_bot'
                });
            }
        }
    });
    
    bot.on('polling_error', (error) => {
        console.log('Bot polling error:', error.message);
    });
    
} catch (error) {
    console.error('Failed to start bot:', error.message);
}

// ========== API এন্ডপয়েন্ট ==========
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        bot: bot ? 'running' : 'stopped'
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

app.post('/api/upload', upload.single('image'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
        
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
        
        res.json({ success: true, url: shareUrl, id: imageId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/share/:id', (req, res) => {
    const { id } = req.params;
    const image = images[id];
    
    if (!image) {
        return res.status(404).send('<h1>Image Not Found</h1>');
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
                    font-size: 16px;
                }
                button:hover {
                    background: #5a67d8;
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
                    alert('✅ Link copied to clipboard!');
                }
            </script>
        </body>
        </html>
    `);
});

app.get('/api/images', (req, res) => {
    res.json({ images: Object.values(images) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`🤖 Bot: @TNEH_Image_Share_Bot`);
});

export default app;

import TelegramBot from 'node-telegram-bot-api';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// আপনার বোট টোকেন এখানে দিন
const BOT_TOKEN = process.env.BOT_TOKEN || '8883310302:AAE7E4RXdhErGPJ1om-CLeCeoXSnbbdzQu4';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ফোল্ডার তৈরি
const uploadsDir = path.join(__dirname, 'bot_uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ডাটাবেস (JSON ফাইল)
let images = {};
const dbFile = path.join(__dirname, 'bot_db.json');
if (fs.existsSync(dbFile)) {
    images = JSON.parse(fs.readFileSync(dbFile));
}

const BASE_URL = 'https://tnehimagetosharelinkgenerator.onrender.com';

// /start কমান্ড
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `
🎉 *Welcome to Image Share Link Generator!* 🎉

Send me any image and get a shareable link instantly.

✨ *Features:*
• 📸 Instant image upload
• 🔗 Shareable link generated
• 💾 Permanent storage
• 🌐 Access from anywhere

*Just send me an image now!* 🖼️

📊 /stats - Your upload stats
📖 /help - How to use
🌐 /website - Open website
    `, { parse_mode: 'Markdown' });
});

// /help কমান্ড
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `
📖 *How to use this bot:*

1️⃣ *Send an image* (photo or file)
2️⃣ *Wait for upload* (few seconds)
3️⃣ *Get your shareable link*
4️⃣ *Share link anywhere!*

🔗 *Example link:*
\`${BASE_URL}/share/image-id\`

💡 *Pro tip:* Send high-quality images for better results!

Commands:
/start - Restart bot
/stats - Your statistics
/website - Open web version
    `, { parse_mode: 'Markdown' });
});

// /stats কমান্ড
bot.onText(/\/stats/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    const userImages = Object.values(images).filter(img => img.userId === userId);
    
    if (userImages.length === 0) {
        bot.sendMessage(chatId, '📊 You haven\'t uploaded any images yet. Send me an image to get started!');
    } else {
        const totalViews = userImages.reduce((sum, img) => sum + (img.views || 0), 0);
        bot.sendMessage(chatId, `
📊 *Your Statistics:*

• Total images: *${userImages.length}*
• Total views: *${totalViews}*
• Last upload: *${new Date(userImages[userImages.length-1]?.createdAt).toLocaleString()}*

Keep sharing! 🚀
        `, { parse_mode: 'Markdown' });
    }
});

// /website কমান্ড
bot.onText(/\/website/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `
🌐 *Visit our website:*

${BASE_URL}

Upload from browser and get shareable links instantly!

Features:
• Drag & drop upload
• QR code generator
• Image gallery
• And more!
    `, { parse_mode: 'Markdown' });
});

// ফটো হ্যান্ডেল করা
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    
    bot.sendChatAction(chatId, 'upload_photo');
    bot.sendMessage(chatId, '📤 *Uploading your image...*', { parse_mode: 'Markdown' });
    
    try {
        const photo = msg.photo[msg.photo.length - 1];
        const file = await bot.getFile(photo.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
        
        // ডাউনলোড ইমেজ
        const response = await fetch(fileUrl);
        const buffer = await response.arrayBuffer();
        
        // সেভ ইমেজ
        const imageId = uuidv4();
        const filename = `${imageId}.jpg`;
        const filePath = path.join(uploadsDir, filename);
        fs.writeFileSync(filePath, Buffer.from(buffer));
        
        // বেস64
        const base64 = Buffer.from(buffer).toString('base64');
        const dataUrl = `data:image/jpeg;base64,${base64}`;
        
        // সেভ টু ডাটাবেস
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
        
        // সফল মেসেজ
        await bot.sendMessage(chatId, `
✅ *Image Uploaded Successfully!*

🔗 *Your Shareable Link:*
\`${shareUrl}\`

📊 *Stats:*
• Size: ${(file.file_size / 1024).toFixed(2)} KB
• ID: \`${imageId.substring(0, 8)}...\`

💡 *Click the link to view and share!*
        `, { parse_mode: 'Markdown' });
        
        // প্রিভিউ সেন্ড
        await bot.sendPhoto(chatId, shareUrl, {
            caption: `🖼️ Your shared image\n🔗 ${shareUrl}`
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        bot.sendMessage(chatId, `❌ *Upload Failed!*\n\nError: ${error.message}\n\nPlease try again or use website: ${BASE_URL}`, { parse_mode: 'Markdown' });
    }
});

// ডকুমেন্ট হ্যান্ডেল
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const doc = msg.document;
    
    if (!doc.mime_type.startsWith('image/')) {
        return bot.sendMessage(chatId, '❌ Please send an image file (JPEG, PNG, GIF, WebP, etc.)');
    }
    
    bot.sendChatAction(chatId, 'upload_document');
    bot.sendMessage(chatId, '📤 *Uploading your image...*', { parse_mode: 'Markdown' });
    
    try {
        const file = await bot.getFile(doc.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
        
        const response = await fetch(fileUrl);
        const buffer = await response.arrayBuffer();
        
        const imageId = uuidv4();
        const ext = doc.mime_type.split('/')[1];
        const filename = `${imageId}.${ext}`;
        const filePath = path.join(uploadsDir, filename);
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
            createdAt: new Date().toISOString()
        };
        fs.writeFileSync(dbFile, JSON.stringify(images, null, 2));
        
        const shareUrl = `${BASE_URL}/share/${imageId}`;
        
        await bot.sendMessage(chatId, `
✅ *Image Uploaded Successfully!*

🔗 *Shareable Link:*
\`${shareUrl}\`

📄 *File:* ${doc.file_name}
📊 *Size:* ${(file.file_size / 1024).toFixed(2)} KB

Share this link with anyone! 🚀
        `, { parse_mode: 'Markdown' });
        
    } catch (error) {
        console.error('Document upload error:', error);
        bot.sendMessage(chatId, `❌ Upload failed: ${error.message}`);
    }
});

// ইনলাইন বাটন
bot.onText(/\/share/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '🎯 *Choose an option:*', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🌐 Open Website', url: BASE_URL }],
                [{ text: '📸 Send Image', callback_data: 'send_image' }],
                [{ text: '📊 My Stats', callback_data: 'show_stats' }]
            ]
        }
    });
});

// কলব্যাক কুয়েরি
bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = message.chat.id;
    
    if (data === 'send_image') {
        bot.sendMessage(chatId, '📸 *Send me an image now!*\n\nJust send a photo or document.', { parse_mode: 'Markdown' });
    }
    
    if (data === 'show_stats') {
        const userId = callbackQuery.from.id;
        const userImages = Object.values(images).filter(img => img.userId === userId);
        
        if (userImages.length === 0) {
            bot.sendMessage(chatId, 'No uploads yet. Send me an image!');
        } else {
            bot.sendMessage(chatId, `
📊 *Your Stats:*
• Total: ${userImages.length}
• Views: ${userImages.reduce((sum, img) => sum + (img.views || 0), 0)}
• Recent: ${userImages.slice(-3).reverse().map(img => `\n  📷 ${img.createdAt.substring(0, 10)}`).join('')}
            `, { parse_mode: 'Markdown' });
        }
    }
    
    bot.answerCallbackQuery(callbackQuery.id);
});

console.log('🤖 Telegram Bot is running...');
console.log('✅ Bot is ready to receive images!');

// Render এ রাখার জন্য
import express from 'express';
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`Web server on port ${PORT}`));

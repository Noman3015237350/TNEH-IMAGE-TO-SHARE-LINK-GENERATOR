import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// টেলিগ্রাম বোট টোকেন (আপনার টোকেন দিন)
const BOT_TOKEN = '8883310302:AAE7E4RXdhErGPJ1om-CLeCeoXSnbbdzQu4'; // @BotFather থেকে নিন
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const app = express();
app.use(express.json());

// ইমেজ স্টোর করার ফোল্ডার
const uploadsDir = path.join(__dirname, 'telegram_uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ইমেজ মেটাডাটা স্টোর
let images = {};
const imagesFile = path.join(__dirname, 'telegram_images.json');
if (fs.existsSync(imagesFile)) {
  images = JSON.parse(fs.readFileSync(imagesFile));
}

// বেস URL (Render এর URL)
const BASE_URL = 'https://tnehimagetosharelinkgenerator.onrender.com';

// /start কমান্ড
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `
🎉 *Welcome to Image Share Link Generator Bot!* 🎉

📸 Send me any image and I'll give you a shareable link instantly.

🔗 *Features:*
• Instant shareable links
• No registration required
• Permanent storage
• Easy to share anywhere

Send me an image now! 🖼️
  `, { parse_mode: 'Markdown' });
});

// /help কমান্ড
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `
📖 *How to use:*
1️⃣ Send me any image
2️⃣ Wait for upload
3️⃣ Get your shareable link
4️⃣ Share the link anywhere!

📌 *Commands:*
/start - Welcome message
/help - This help
/stats - Your upload stats
/website - Visit our website

🔗 *Website:* ${BASE_URL}
  `, { parse_mode: 'Markdown' });
});

// /stats কমান্ড
bot.onText(/\/stats/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  const userImages = Object.values(images).filter(img => img.userId === userId);
  bot.sendMessage(chatId, `
📊 *Your Statistics:*
• Total uploads: ${userImages.length}
• Total views: ${userImages.reduce((sum, img) => sum + (img.views || 0), 0)}
• Last upload: ${userImages[userImages.length - 1]?.createdAt || 'Never'}

Keep sharing! 🚀
  `, { parse_mode: 'Markdown' });
});

// /website কমান্ড
bot.onText(/\/website/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `
🌐 *Visit our website:*
${BASE_URL}

Upload images directly from browser! 📸
  `, { parse_mode: 'Markdown' });
});

// ফটো হ্যান্ডেল করা
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name;
  
  // সেন্ডিং ইন্ডিকেটর
  bot.sendChatAction(chatId, 'upload_photo');
  
  try {
    // সবচেয়ে বড় সাইজের ফটো নেওয়া
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;
    
    // ফাইল লিংক পাওয়া
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    
    // ফাইল ডাউনলোড করা
    const response = await fetch(fileUrl);
    const buffer = await response.arrayBuffer();
    
    // ইউনিক আইডি জেনারেট
    const imageId = uuidv4();
    const filename = `${imageId}.jpg`;
    const filePath = path.join(uploadsDir, filename);
    
    // ফাইল সেভ করা
    fs.writeFileSync(filePath, Buffer.from(buffer));
    
    // বেস64 তে কনভার্ট
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64}`;
    
    // মেটাডাটা সেভ
    images[imageId] = {
      id: imageId,
      userId: userId,
      username: username,
      filename: filename,
      dataUrl: dataUrl,
      views: 0,
      createdAt: new Date().toISOString()
    };
    
    fs.writeFileSync(imagesFile, JSON.stringify(images, null, 2));
    
    // শেয়ারেবল লিংক
    const shareUrl = `${BASE_URL}/share/${imageId}`;
    
    // সাকসেস মেসেজ
    await bot.sendMessage(chatId, `
✅ *Image Uploaded Successfully!*

🔗 *Your Shareable Link:*
${shareUrl}

📊 *Stats:*
• Size: ${(file.file_size / 1024).toFixed(2)} KB
• ID: ${imageId.substring(0, 8)}...

💡 *Tips:*
• Click link to view image
• Share link anywhere
• Link never expires

${BASE_URL}/share/${imageId}
    `, { parse_mode: 'Markdown' });
    
    // প্রিভিউ সেন্ড করা (অপশনাল)
    await bot.sendPhoto(chatId, shareUrl, {
      caption: `🖼️ Your shared image\n📋 Link: ${shareUrl}`
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    bot.sendMessage(chatId, `
❌ *Upload Failed!*

Error: ${error.message}

Please try again or use our website:
${BASE_URL}
    `, { parse_mode: 'Markdown' });
  }
});

// ডকুমেন্ট হিসেবে ইমেজ হ্যান্ডেল
bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const document = msg.document;
  
  // শুধু ইমেজ ফাইল চেক
  if (!document.mime_type.startsWith('image/')) {
    return bot.sendMessage(chatId, '❌ Please send an image file (JPEG, PNG, GIF, etc.)');
  }
  
  bot.sendChatAction(chatId, 'upload_document');
  
  try {
    const file = await bot.getFile(document.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    
    const response = await fetch(fileUrl);
    const buffer = await response.arrayBuffer();
    
    const imageId = uuidv4();
    const ext = document.mime_type.split('/')[1];
    const filename = `${imageId}.${ext}`;
    const filePath = path.join(uploadsDir, filename);
    
    fs.writeFileSync(filePath, Buffer.from(buffer));
    
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:${document.mime_type};base64,${base64}`;
    
    images[imageId] = {
      id: imageId,
      userId: msg.from.id,
      username: msg.from.username || msg.from.first_name,
      filename: document.file_name,
      dataUrl: dataUrl,
      mimeType: document.mime_type,
      views: 0,
      createdAt: new Date().toISOString()
    };
    
    fs.writeFileSync(imagesFile, JSON.stringify(images, null, 2));
    
    const shareUrl = `${BASE_URL}/share/${imageId}`;
    
    await bot.sendMessage(chatId, `
✅ *Image Uploaded Successfully!*

🔗 *Shareable Link:*
${shareUrl}

📄 *File:* ${document.file_name}
📊 *Size:* ${(file.file_size / 1024).toFixed(2)} KB

Share this link with anyone! 🚀
    `, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Document upload error:', error);
    bot.sendMessage(chatId, `❌ Upload failed: ${error.message}`);
  }
});

// ইনলাইন বাটন সহ মেসেজ
bot.onText(/\/share/, async (msg) => {
  const chatId = msg.chat.id;
  
  const inlineKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🌐 Open Website', url: BASE_URL },
          { text: '📸 Upload Image', callback_data: 'upload_guide' }
        ],
        [
          { text: '📊 My Stats', callback_data: 'show_stats' }
        ]
      ]
    }
  };
  
  bot.sendMessage(chatId, '🎯 *Choose an option:*', {
    parse_mode: 'Markdown',
    ...inlineKeyboard
  });
});

// কলব্যাক কোয়েরি হ্যান্ডেল
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const data = callbackQuery.data;
  const chatId = message.chat.id;
  
  if (data === 'upload_guide') {
    bot.sendMessage(chatId, `
📤 *How to upload:*
Simply send me any image as:
• Photo (compressed)
• Document (original quality)
• Compressed image

I'll generate a shareable link instantly! 🚀
    `, { parse_mode: 'Markdown' });
  }
  
  if (data === 'show_stats') {
    const userId = callbackQuery.from.id;
    const userImages = Object.values(images).filter(img => img.userId === userId);
    
    bot.sendMessage(chatId, `
📊 *Your Stats:*
• Total Images: ${userImages.length}
• Total Views: ${userImages.reduce((sum, img) => sum + (img.views || 0), 0)}
• Last 5 uploads:
${userImages.slice(-5).reverse().map(img => `  • ${img.createdAt.substring(0, 10)}: ${BASE_URL}/share/${img.id.substring(0, 8)}...`).join('\n')}
    `, { parse_mode: 'Markdown' });
  }
  
  bot.answerCallbackQuery(callbackQuery.id);
});

// Error হ্যান্ডেলিং
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('🤖 Telegram Bot is running...');
console.log(`📊 Bot username: ${(await bot.getMe()).username}`);

// এক্সপ্রেস সার্ভার (Render এর জন্য)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

export default bot;

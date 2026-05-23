import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// JSON এবং ফাইল আপলোড সেটআপ
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS সেটআপ
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Memory storage for Render (যেহেতু Render-এ ফাইল সিস্টেমে লেখা সীমিত)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage, 
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// স্ট্যাটিক ফাইল সার্ভ করা
app.use(express.static('public'));

// হোম পেজ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// আপলোড API (ফাইল আপলোডের জন্য)
app.post('/api/upload', upload.single('image'), (req, res) => {
  try {
    console.log('Upload request received');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const fileId = uuidv4();
    const extension = path.extname(req.file.originalname);
    const filename = `${fileId}${extension}`;
    
    // Base64 তে কনভার্ট
    const base64Data = req.file.buffer.toString('base64');
    const imageDataUrl = `data:${req.file.mimetype};base64,${base64Data}`;
    
    // JSON ফাইলে সেভ করা
    let images = {};
    const imagesFile = path.join(__dirname, '..', 'images.json');
    
    if (fs.existsSync(imagesFile)) {
      images = JSON.parse(fs.readFileSync(imagesFile));
    }
    
    images[fileId] = {
      id: fileId,
      filename: filename,
      originalName: req.file.originalname,
      dataUrl: imageDataUrl,
      mimeType: req.file.mimetype,
      size: req.file.size,
      createdAt: new Date().toISOString()
    };
    
    fs.writeFileSync(imagesFile, JSON.stringify(images, null, 2));
    
    const baseUrl = process.env.BASE_URL || `https://tnehimagetosharelinkgenerator.onrender.com`;
    const shareUrl = `${baseUrl}/share/${fileId}`;
    
    console.log('Upload successful:', shareUrl);
    
    res.json({
      success: true,
      url: shareUrl,
      imageUrl: shareUrl,
      id: fileId
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Base64 আপলোড API (ফ্রন্টএন্ডের জন্য)
app.post('/api/upload-base64', (req, res) => {
  try {
    console.log('Base64 upload request received');
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }
    
    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid image data' });
    }
    
    const fileId = uuidv4();
    const mimeType = matches[1];
    const extension = mimeType.split('/')[1];
    const filename = `${fileId}.${extension}`;
    
    // JSON ফাইলে সেভ করা
    let images = {};
    const imagesFile = path.join(__dirname, '..', 'images.json');
    
    if (fs.existsSync(imagesFile)) {
      images = JSON.parse(fs.readFileSync(imagesFile));
    }
    
    images[fileId] = {
      id: fileId,
      filename: filename,
      originalName: `image.${extension}`,
      dataUrl: image,
      mimeType: mimeType,
      createdAt: new Date().toISOString()
    };
    
    fs.writeFileSync(imagesFile, JSON.stringify(images, null, 2));
    
    const baseUrl = process.env.BASE_URL || `https://tnehimagetosharelinkgenerator.onrender.com`;
    const shareUrl = `${baseUrl}/share/${fileId}`;
    
    console.log('Base64 upload successful:', shareUrl);
    
    res.json({
      success: true,
      url: shareUrl,
      imageUrl: shareUrl,
      id: fileId
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// শেয়ার লিংক ভিউ
app.get('/share/:id', (req, res) => {
  const { id } = req.params;
  const imagesFile = path.join(__dirname, '..', 'images.json');
  
  if (!fs.existsSync(imagesFile)) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Image Not Found</title></head>
      <body style="font-family: Arial; text-align: center; padding: 50px;">
        <h1>❌ Image Not Found</h1>
        <p>The image you're looking for doesn't exist or has been removed.</p>
        <a href="/">Go to Homepage</a>
      </body>
      </html>
    `);
  }
  
  const images = JSON.parse(fs.readFileSync(imagesFile));
  const image = images[id];
  
  if (!image) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Image Not Found</title></head>
      <body style="font-family: Arial; text-align: center; padding: 50px;">
        <h1>❌ Image Not Found</h1>
        <p>The image you're looking for doesn't exist or has been removed.</p>
        <a href="/">Go to Homepage</a>
      </body>
      </html>
    `);
  }
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Shared Image - ${image.originalName}</title>
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
                padding: 30px;
                max-width: 90%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                text-align: center;
            }
            img {
                max-width: 100%;
                max-height: 70vh;
                border-radius: 10px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .info {
                margin-top: 20px;
                color: #666;
            }
            button {
                background: #667eea;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 16px;
                margin-top: 15px;
                transition: background 0.3s;
            }
            button:hover {
                background: #5a67d8;
            }
            a {
                color: #667eea;
                text-decoration: none;
                display: inline-block;
                margin-top: 10px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <img src="${image.dataUrl}" alt="${image.originalName}">
            <div class="info">
                <p>📸 ${image.originalName}</p>
                <p>📅 ${new Date(image.createdAt).toLocaleString()}</p>
                <button onclick="copyLink()">📋 Copy Share Link</button>
                <br>
                <a href="/">← Upload More Images</a>
            </div>
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

// সব ইমেজের লিস্ট
app.get('/api/images', (req, res) => {
  const imagesFile = path.join(__dirname, '..', 'images.json');
  if (!fs.existsSync(imagesFile)) {
    return res.json({ images: [] });
  }
  const images = JSON.parse(fs.readFileSync(imagesFile));
  res.json({ images: Object.values(images) });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📤 Upload endpoint: /api/upload`);
});

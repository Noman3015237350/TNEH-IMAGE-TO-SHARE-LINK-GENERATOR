import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: 'uploads/' });

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}
if (!fs.existsSync('public')) {
  fs.mkdirSync('public');
}

// Serve static files
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Upload endpoint
app.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const fileId = uuidv4();
    const extension = path.extname(req.file.originalname);
    const newFilename = `${fileId}${extension}`;
    const newPath = path.join('uploads', newFilename);
    
    // Rename file
    fs.renameSync(req.file.path, newPath);
    
    // Generate shareable URL
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const shareUrl = `${baseUrl}/share/${fileId}`;
    const imageUrl = `${baseUrl}/uploads/${newFilename}`;
    
    // Store metadata (you can use database for production)
    const metadata = {
      id: fileId,
      filename: newFilename,
      originalName: req.file.originalname,
      url: imageUrl,
      createdAt: new Date().toISOString()
    };
    
    // Save to JSON file (for demo)
    let images = {};
    if (fs.existsSync('images.json')) {
      images = JSON.parse(fs.readFileSync('images.json'));
    }
    images[fileId] = metadata;
    fs.writeFileSync('images.json', JSON.stringify(images, null, 2));
    
    res.json({
      success: true,
      url: shareUrl,
      imageUrl: imageUrl,
      id: fileId
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Base64 upload endpoint (for frontend FileReader)
app.post('/upload-base64', (req, res) => {
  try {
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }
    
    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid image data' });
    }
    
    const ext = matches[1].split('/')[1];
    const fileId = uuidv4();
    const filename = `${fileId}.${ext}`;
    const filePath = path.join('uploads', filename);
    
    // Save base64 to file
    fs.writeFileSync(filePath, Buffer.from(matches[2], 'base64'));
    
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const shareUrl = `${baseUrl}/share/${fileId}`;
    const imageUrl = `${baseUrl}/uploads/${filename}`;
    
    res.json({
      success: true,
      url: shareUrl,
      imageUrl: imageUrl,
      id: fileId
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get image by ID
app.get('/share/:id', (req, res) => {
  const { id } = req.params;
  
  if (!fs.existsSync('images.json')) {
    return res.status(404).send('Image not found');
  }
  
  const images = JSON.parse(fs.readFileSync('images.json'));
  const image = images[id];
  
  if (!image) {
    return res.status(404).send('Image not found');
  }
  
  // Serve HTML page with the image
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Shared Image</title>
        <meta property="og:image" content="${image.url}">
        <meta property="og:title" content="Shared Image">
        <style>
            body {
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                margin: 0;
                background: #f0f0f0;
                font-family: Arial, sans-serif;
            }
            .container {
                text-align: center;
                padding: 20px;
            }
            img {
                max-width: 90vw;
                max-height: 80vh;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                border-radius: 8px;
            }
            .info {
                margin-top: 20px;
                color: #666;
            }
            button {
                background: #0070f3;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
                margin-top: 10px;
            }
            button:hover {
                background: #0051cc;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <img src="${image.url}" alt="${image.originalName}">
            <div class="info">
                <p>Filename: ${image.originalName}</p>
                <button onclick="copyLink()">Copy Image Link</button>
            </div>
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

// List all images
app.get('/images', (req, res) => {
  if (!fs.existsSync('images.json')) {
    return res.json({ images: [] });
  }
  const images = JSON.parse(fs.readFileSync('images.json'));
  res.json({ images: Object.values(images) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Upload endpoint: http://localhost:${PORT}/upload`);
});

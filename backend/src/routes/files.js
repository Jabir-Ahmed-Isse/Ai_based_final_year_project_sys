const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const uploadDir = path.join(__dirname, '../../uploads/messages');
fs.mkdirSync(uploadDir, { recursive: true });

const allowedMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/gif',
  'text/plain'
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeBase = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-z0-9_-]/gi, '-')
      .slice(0, 80);
    cb(null, `${Date.now()}-${safeBase}${path.extname(file.originalname).toLowerCase()}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtension = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.gif', '.txt'].includes(ext);
    if (allowedMimeTypes.has(file.mimetype) || allowedExtension) {
      cb(null, true);
      return;
    }
    cb(new Error('Unsupported file type'));
  }
});

router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const url = `${req.protocol}://${req.get('host')}/uploads/messages/${req.file.filename}`;
  res.status(201).json({
    id: req.file.filename,
    name: req.file.originalname,
    url,
    type: req.file.mimetype,
    size: req.file.size
  });
});

router.get('/:fileId', (req, res) => {
  const filename = path.basename(req.params.fileId);
  const filePath = path.join(uploadDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'File not found' });
  }
  res.sendFile(filePath);
});

router.delete('/:fileId', (req, res) => {
  const filename = path.basename(req.params.fileId);
  const filePath = path.join(uploadDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'File not found' });
  }
  fs.unlinkSync(filePath);
  res.json({ message: 'File deleted' });
});

module.exports = router;

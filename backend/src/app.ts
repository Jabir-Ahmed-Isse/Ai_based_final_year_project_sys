import express from 'express';
import cors from 'cors';
import path from 'path';
import connectDB from './config/db';

const { seedTaxonomy } = require('./utils/seedTaxonomy');
const app = express();

connectDB().then(seedTaxonomy);

const allowedDevOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedDevOrigin.test(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/', (_req, res) => {
  res.send('Server is running!');
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/taxonomy', require('./routes/taxonomy'));
app.use('/api/org', require('./routes/org'));
app.use('/api/users', require('./routes/users'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/files', require('./routes/files'));
app.use('/api/ideas', require('./routes/ideas'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/guidelines', require('./routes/guidelines'));
app.use('/api/similarity-results', require('./routes/similarityResults'));
app.use('/api/research', require('./routes/research'));

app.use((_req, res) => {
  res.status(404).json({ message: 'API route not found' });
});

app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack || err.message || err);
  res.status(err.status || 500).json({
    message: err.message || 'Server Error'
  });
});

export default app;

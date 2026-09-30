"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const db_1 = __importDefault(require("./config/db"));
const { seedTaxonomy } = require('./utils/seedTaxonomy');
const app = (0, express_1.default)();
(0, db_1.default)().then(seedTaxonomy);
const allowedDevOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedDevOrigin.test(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
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
app.use((err, _req, res, _next) => {
    console.error(err.stack || err.message || err);
    res.status(err.status || 500).json({
        message: err.message || 'Server Error'
    });
});
exports.default = app;
//# sourceMappingURL=app.js.map
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, closeDb } from './db/connection.js';
import { startHeartbeat, stopHeartbeat } from './heartbeat.js';
import dbRouter from './routes/db.js';
import checkWalletBalanceRouter from './routes/checkWalletBalance.js';
import sendLanaTransactionRouter from './routes/sendLanaTransaction.js';
import sendLanaMultiOutputRouter from './routes/sendLanaMultiOutput.js';
import publishPlanRouter from './routes/publishPlan.js';
import processPendingPaymentsRouter from './routes/processPendingPayments.js';
import checkWalletRegistrationRouter from './routes/checkWalletRegistration.js';
import { domainKeyMiddleware } from './middleware/domainKey.js';
import domainConfigRouter from './routes/domainConfig.js';
import adminAuthRouter from './routes/adminAuth.js';
import contentManagementRouter from './routes/contentManagement.js';
import registerVirginWalletsRouter from './routes/registerVirginWallets.js';
import globalSlotsRouter from './routes/globalSlots.js';
import checkLana8WonderRouter from './routes/checkLana8Wonder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || process.env.SERVER_PORT || '3000', 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(domainKeyMiddleware);

// Initialize database
getDb();

// API Routes - Edge functions
app.use('/api/check-wallet-balance', checkWalletBalanceRouter);
app.use('/api/send-lana-transaction', sendLanaTransactionRouter);
app.use('/api/send-lana-multi-output', sendLanaMultiOutputRouter);
app.use('/api/publish-lana8wonder-plan', publishPlanRouter);
app.use('/api/process-pending-payments', processPendingPaymentsRouter);
app.use('/api/check-wallet-registration', checkWalletRegistrationRouter);
app.use('/api/register-virgin-wallets', registerVirginWalletsRouter);
app.use('/api/domain-config', domainConfigRouter);
app.use('/api/check-admin', adminAuthRouter);
app.use('/api/content', contentManagementRouter);
app.use('/api/global-slots', globalSlotsRouter);
app.use('/api/check-lana8wonder', checkLana8WonderRouter);

// API Routes - Generic DB CRUD
app.use('/api/db', dbRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static frontend files (production)
const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));

// SPA fallback - serve index.html for all non-API routes
app.use((_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API: http://localhost:${PORT}/api/health`);

  // Start heartbeat for processing pending payments
  startHeartbeat();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  stopHeartbeat();
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  stopHeartbeat();
  closeDb();
  process.exit(0);
});

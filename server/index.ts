import express from 'express';
import compression from 'compression';
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
import { nostrAuthMiddleware } from './middleware/nostrAuth.js';
import { requireAdmin, requireSelfOrAdmin } from './middleware/requireAdmin.js';
import domainConfigRouter from './routes/domainConfig.js';
import adminAuthRouter from './routes/adminAuth.js';
import contentManagementRouter from './routes/contentManagement.js';
import registerVirginWalletsRouter from './routes/registerVirginWallets.js';
import globalSlotsRouter from './routes/globalSlots.js';
import checkLana8WonderRouter from './routes/checkLana8Wonder.js';
import fetchKind30889Router from './routes/fetchKind30889.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Gzip every response. Measured 2026-08-05 on direct.lana.fund: a 5.1 MB
// admin JSON feed was going out UNCOMPRESSED — nothing in the chain (app or
// nginx-proxy) set Content-Encoding — and the page took ~10 s. The same
// payload gzips ~10x. Registered first so it wraps every route.
app.use(compression());
const PORT = parseInt(process.env.PORT || process.env.SERVER_PORT || '3000', 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(domainKeyMiddleware);
// Records a PROVEN caller identity on req.authedPubkey when the request
// carries a valid NIP-98 signature. Rejects nothing by itself.
app.use(nostrAuthMiddleware);

// Initialize database
getDb();

// API Routes - Edge functions
//
// OPEN endpoints below are open on purpose: they either return public
// information (electrum balances, relay data) or require the caller to supply
// the private key of the wallet being spent, which IS the authorization.

// OPEN: reads public chain balances for addresses the caller names.
app.use('/api/check-wallet-balance', checkWalletBalanceRouter);
// OPEN: the caller supplies the sending wallet's own WIF; the route refuses a
// key that does not derive to the sender. Holding the key is the permission.
app.use('/api/send-lana-transaction', sendLanaTransactionRouter);
app.use('/api/send-lana-multi-output', sendLanaMultiOutputRouter);
// GATED: signs KIND 88888 with the CENTRAL AUTHORITY key, addressable on
// d=plan:<subject_hex> — an ungated call could replace any person's plan.
// Ordinary buyers publish their OWN plan here, so the gate is self-or-admin,
// not admin-only.
app.use('/api/publish-lana8wonder-plan', requireSelfOrAdmin((req) => req.body?.subject_hex), publishPlanRouter);
// GATED: moves real money out of the domain donation wallet, and exposes the
// wallet's configuration. The heartbeat calls the function directly, not over
// HTTP, so nothing legitimate loses access.
app.use('/api/process-pending-payments', requireAdmin, processPendingPaymentsRouter);
// OPEN: yes/no registration lookup for a single wallet address.
app.use('/api/check-wallet-registration', checkWalletRegistrationRouter);
// GATED: spends the server's registrar API key to WRITE a registration under a
// person's identity. Buyers register their own wallets here.
app.use('/api/register-virgin-wallets', requireSelfOrAdmin((req) => req.body?.nostr_id_hex), registerVirginWalletsRouter);
// MIXED: public GET, admin-gated PUT (gated inside the router).
app.use('/api/domain-config', domainConfigRouter);
app.use('/api/check-admin', adminAuthRouter);
// MIXED: public FAQ/what-is-lana reads, admin-gated writes (inside the router).
app.use('/api/content', contentManagementRouter);
// OPEN: public slot availability for the global landing page.
app.use('/api/global-slots', globalSlotsRouter);
// OPEN: reads a public relay record; used in the buy flow before login.
app.use('/api/check-lana8wonder', checkLana8WonderRouter);
// OPEN despite the /admin/ path: it only re-reads KIND 30889, which is public
// on the relays, and the ordinary buy flow uses it to recover a lost wallet.
app.use('/api/admin/fetch-kind30889', fetchKind30889Router);

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

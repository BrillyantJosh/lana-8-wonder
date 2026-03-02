import { processPendingPayments } from './routes/processPendingPayments.js';

const HEARTBEAT_INTERVAL = 30 * 1000; // 30 seconds
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export function startHeartbeat(): void {
  console.log(`Heartbeat started (interval: ${HEARTBEAT_INTERVAL / 1000}s)`);

  // Run immediately on startup
  runHeartbeat();

  heartbeatTimer = setInterval(() => {
    runHeartbeat();
  }, HEARTBEAT_INTERVAL);
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    console.log('Heartbeat stopped');
  }
}

async function runHeartbeat(): Promise<void> {
  if (isRunning) {
    console.log('Heartbeat: skipping (previous run still active)');
    return;
  }

  isRunning = true;
  try {
    const result = await processPendingPayments();
    if (result.processed > 0) {
      console.log(`Heartbeat: processed ${result.processed} pending payment(s), txid: ${result.txid}`);
    }
  } catch (err: any) {
    // Don't crash on heartbeat errors
    if (err.message?.includes('No pending payments') || err.message?.includes('No UTXOs')) {
      // Silent - these are expected conditions
    } else {
      console.error('Heartbeat error:', err.message || err);
    }
  } finally {
    isRunning = false;
  }
}

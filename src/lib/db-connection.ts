// ⚡ DATABASE CONNECTION MANAGER
// Handles MongoDB connection pooling, reconnection, and circuit breaking

interface ConnectionStats {
  lastError?: Error;
  errorCount: number;
  consecutiveErrors: number;
  lastErrorTime?: number;
}

const stats: ConnectionStats = {
  errorCount: 0,
  consecutiveErrors: 0,
};

const CIRCUIT_BREAKER_THRESHOLD = 5; // Break after 5 consecutive errors
const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds before retry
const ERROR_RESET_TIMEOUT = 60000; // Reset error count after 1 minute

export async function executeWithConnectionHandling<T>(
  fn: () => Promise<T>,
  operationName: string = 'database-operation'
): Promise<T> {
  // ⚡ CIRCUIT BREAKER: Fail fast if too many errors
  if (stats.consecutiveErrors >= CIRCUIT_BREAKER_THRESHOLD) {
    const timeSinceLastError = Date.now() - (stats.lastErrorTime || 0);
    
    if (timeSinceLastError < CIRCUIT_BREAKER_TIMEOUT) {
      const waitTime = CIRCUIT_BREAKER_TIMEOUT - timeSinceLastError;
      console.warn(
        `[${operationName}] Circuit breaker open. Waiting ${waitTime}ms before retry...`
      );
      throw new Error(
        `Database connection circuit breaker open. Too many errors. Retry after ${waitTime}ms`
      );
    }
    
    // Reset circuit breaker
    stats.consecutiveErrors = 0;
  }

  // ⚡ RESET ERROR COUNT if enough time has passed
  if (stats.lastErrorTime && Date.now() - stats.lastErrorTime > ERROR_RESET_TIMEOUT) {
    stats.consecutiveErrors = 0;
  }

  try {
    const result = await fn();
    
    // ⚡ SUCCESS: Reset error tracking
    stats.consecutiveErrors = 0;
    stats.lastError = undefined;
    stats.errorCount++;
    
    return result;
  } catch (error: any) {
    stats.consecutiveErrors++;
    stats.lastError = error;
    stats.lastErrorTime = Date.now();
    stats.errorCount++;

    const isConnectionError =
      error?.code === 'P2010' ||
      error?.code === 'P2013' ||
      error?.message?.includes('connection') ||
      error?.message?.includes('I/O error') ||
      error?.message?.includes('ECONNREFUSED') ||
      error?.message?.includes('ETIMEDOUT') ||
      error?.message?.includes('10054'); // Connection forcibly closed

    console.error(
      `[${operationName}] ${isConnectionError ? 'Connection error' : 'Query error'}: ${error?.message}`,
      {
        code: error?.code,
        consecutiveErrors: stats.consecutiveErrors,
        totalErrors: stats.errorCount,
      }
    );

    throw error;
  }
}

export function getConnectionStats() {
  return {
    ...stats,
    isCircuitBreakerOpen: stats.consecutiveErrors >= CIRCUIT_BREAKER_THRESHOLD,
  };
}

export function resetConnectionStats() {
  stats.errorCount = 0;
  stats.consecutiveErrors = 0;
  stats.lastError = undefined;
  stats.lastErrorTime = undefined;
}

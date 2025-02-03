import eventEmitter from './EventEmitter.js';
import { ERRORS } from '../config/config.js';

/**
 * Custom error types for specific error scenarios
 */
export class VideoError extends Error {
  constructor(message, code, recoverable = true) {
    super(message);
    this.name = 'VideoError';
    this.code = code;
    this.recoverable = recoverable;
  }
}

export class ProviderError extends Error {
  constructor(message, provider) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
  }
}

export class BufferError extends Error {
  constructor(message, currentTime) {
    super(message);
    this.name = 'BufferError';
    this.currentTime = currentTime;
  }
}

/**
 * Main error handler class
 */
export class ErrorHandler {
  constructor() {
    this.retryCount = new Map();
    this.errorLog = [];
    this.maxLogSize = 100;
  }

  /**
   * Handle a video playback error
   * @param {Error} error - The error to handle
   * @param {Object} context - Additional context about the error
   * @returns {Promise<boolean>} - Whether the error was handled successfully
   */
  async handleVideoError(error, context = {}) {
    const errorInfo = {
      timestamp: Date.now(),
      error: error,
      context: context
    };

    this.logError(errorInfo);

    if (error instanceof VideoError && !error.recoverable) {
      eventEmitter.emit('error:fatal', error);
      return false;
    }

    const retryKey = this.getRetryKey(error, context);
    const retryCount = this.retryCount.get(retryKey) || 0;

    if (retryCount >= ERRORS.MAX_RETRIES) {
      eventEmitter.emit('error:max-retries', error);
      this.retryCount.delete(retryKey);
      return false;
    }

    this.retryCount.set(retryKey, retryCount + 1);

    try {
      await this.attemptRecovery(error, context);
      this.retryCount.delete(retryKey);
      return true;
    } catch (recoveryError) {
      eventEmitter.emit('error:recovery-failed', recoveryError);
      return false;
    }
  }

  /**
   * Handle a provider error
   * @param {ProviderError} error - The provider error
   * @param {Object} context - Additional context
   * @returns {Promise<boolean>} - Whether the error was handled
   */
  async handleProviderError(error, context = {}) {
    eventEmitter.emit('provider:error', { error, context });

    const retryKey = `provider:${error.provider}`;
    const retryCount = this.retryCount.get(retryKey) || 0;

    if (retryCount >= ERRORS.MAX_RETRIES) {
      eventEmitter.emit('provider:disabled', error.provider);
      this.retryCount.delete(retryKey);
      return false;
    }

    this.retryCount.set(retryKey, retryCount + 1);
    await new Promise(resolve => setTimeout(resolve, ERRORS.RETRY_DELAY));

    return true;
  }

  /**
   * Handle a buffering error
   * @param {BufferError} error - The buffer error
   * @param {Object} context - Additional context
   * @returns {Promise<boolean>} - Whether the error was handled
   */
  async handleBufferError(error, context = {}) {
    eventEmitter.emit('buffer:error', { error, context });

    const retryKey = `buffer:${Math.floor(error.currentTime)}`;
    const retryCount = this.retryCount.get(retryKey) || 0;

    if (retryCount >= ERRORS.MAX_RETRIES) {
      eventEmitter.emit('buffer:failed', error);
      this.retryCount.delete(retryKey);
      return false;
    }

    this.retryCount.set(retryKey, retryCount + 1);
    return true;
  }

  /**
   * Attempt to recover from an error
   * @param {Error} error - The error to recover from
   * @param {Object} context - Error context
   * @returns {Promise<void>}
   */
  async attemptRecovery(error, context) {
    if (error instanceof VideoError) {
      await this.recoverFromVideoError(error, context);
    } else if (error instanceof ProviderError) {
      await this.recoverFromProviderError(error, context);
    } else if (error instanceof BufferError) {
      await this.recoverFromBufferError(error, context);
    } else {
      throw new Error('Unknown error type');
    }
  }

  /**
   * Get a unique key for retry counting
   * @param {Error} error - The error
   * @param {Object} context - Error context
   * @returns {string} - Retry key
   */
  getRetryKey(error, context) {
    if (error instanceof VideoError) {
      return `video:${error.code}`;
    } else if (error instanceof ProviderError) {
      return `provider:${error.provider}`;
    } else if (error instanceof BufferError) {
      return `buffer:${Math.floor(error.currentTime)}`;
    }
    return 'generic';
  }

  /**
   * Log an error for tracking
   * @param {Object} errorInfo - Error information to log
   */
  logError(errorInfo) {
    this.errorLog.unshift(errorInfo);
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.pop();
    }
  }

  /**
   * Get recent errors
   * @param {number} count - Number of recent errors to get
   * @returns {Array} - Recent errors
   */
  getRecentErrors(count = 10) {
    return this.errorLog.slice(0, count);
  }

  /**
   * Clear error retry counts
   */
  clearRetryCount() {
    this.retryCount.clear();
  }

  /**
   * Reset error handler state
   */
  reset() {
    this.clearRetryCount();
    this.errorLog = [];
  }
}

// Create and export singleton instance
const errorHandler = new ErrorHandler();
export default errorHandler;
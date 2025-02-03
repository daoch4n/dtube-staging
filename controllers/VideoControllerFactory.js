import { VideoController } from '../videoController.js';
import { VIDEO, PROVIDERS } from '../config/config.js';
import eventEmitter from '../utils/EventEmitter.js';
import errorHandler from '../utils/ErrorHandler.js';
import { VideoError, ProviderError, BufferError } from '../utils/ErrorHandler.js';

/**
 * Factory class for creating and managing video controllers
 */
class VideoControllerFactory {
  constructor() {
    this.activeControllers = new Map();
    this.providerCache = new Map();
    this.initialize();
  }

  /**
   * Initialize the factory
   */
  initialize() {
    this.setupEventListeners();
    this.loadProviderCache();
  }

  /**
   * Create a new video controller instance
   * @param {HTMLVideoElement} videoElement - The video element to control
   * @returns {VideoController} - New video controller instance
   */
  createController(videoElement) {
    if (!videoElement) {
      throw new Error('Video element is required');
    }

    const providers = this.getProviders();
    const controller = new VideoController(videoElement, providers);

    this.setupControllerEvents(controller);
    this.activeControllers.set(videoElement, controller);

    return controller;
  }

  /**
   * Get a controller for a video element
   * @param {HTMLVideoElement} videoElement - The video element
   * @returns {VideoController} - The video controller
   */
  getController(videoElement) {
    if (!this.activeControllers.has(videoElement)) {
      return this.createController(videoElement);
    }
    return this.activeControllers.get(videoElement);
  }

  /**
   * Set up event listeners for the factory
   */
  setupEventListeners() {
    eventEmitter.on('provider:error', ({ error, context }) => {
      this.handleProviderError(error, context);
    });

    eventEmitter.on('provider:disabled', (provider) => {
      this.disableProvider(provider);
    });
  }

  /**
   * Set up events for a specific controller
   * @param {VideoController} controller - The controller to set up
   */
  setupControllerEvents(controller) {
    // Video state events
    controller.video.addEventListener('loadstart', () => {
      eventEmitter.emit('video:loadstart', { controller });
    });

    controller.video.addEventListener('waiting', () => {
      if (!controller.isSeeking) {
        eventEmitter.emit('video:buffering', { controller });
      }
    });

    controller.video.addEventListener('error', (e) => {
      this.handleVideoError(e, controller);
    });

    // Buffer events
    controller.video.addEventListener('progress', () => {
      const buffered = controller.video.buffered;
      if (buffered.length > 0) {
        const bufferedEnd = buffered.end(buffered.length - 1);
        eventEmitter.emit('video:buffer-update', {
          controller,
          buffered: bufferedEnd,
          duration: controller.video.duration
        });
      }
    });
  }

  /**
   * Get sorted list of providers
   * @returns {Array} - List of provider objects
   */
  getProviders() {
    return PROVIDERS.list
      .filter(name => !this.isProviderDisabled(name))
      .map(name => ({
        name: PROVIDERS.displayNames[name],
        fetch: (cid, start, end) => this.fetchWithProvider(name, cid, start, end)
      }))
      .sort((a, b) => {
        const statsA = this.providerCache.get(a.name) || { score: 0 };
        const statsB = this.providerCache.get(b.name) || { score: 0 };
        return statsB.score - statsA.score;
      });
  }

  /**
   * Fetch content from a provider
   * @param {string} provider - Provider name
   * @param {string} cid - Content ID
   * @param {number} start - Start byte
   * @param {number} end - End byte
   * @returns {Promise<Response>} - Fetch response
   */
  async fetchWithProvider(provider, cid, start, end) {
    try {
      const url = this.buildProviderUrl(provider, cid);
      const response = await fetch(url, {
        headers: { Range: `bytes=${start}-${end}` }
      });

      if (!response.ok) {
        throw new ProviderError(`HTTP ${response.status}`, provider);
      }

      this.updateProviderScore(provider, true);
      return response;
    } catch (error) {
      this.updateProviderScore(provider, false);
      throw error;
    }
  }

  /**
   * Build URL for a provider
   * @param {string} provider - Provider name
   * @param {string} cid - Content ID
   * @returns {string} - Provider URL
   */
  buildProviderUrl(provider, cid) {
    if (provider === 'ipfs.io') {
      return `https://ipfs.io/ipfs/${cid}`;
    }
    return ["dweb.link", "flk-ipfs.xyz"].includes(provider)
      ? `https://${cid}.ipfs.${provider}`
      : `https://ipfs.${provider}/ipfs/${cid}`;
  }

  /**
   * Update provider performance score
   * @param {string} provider - Provider name
   * @param {boolean} success - Whether the request was successful
   */
  updateProviderScore(provider, success) {
    const stats = this.providerCache.get(provider) || {
      score: 0.5,
      successes: 0,
      failures: 0
    };

    if (success) {
      stats.successes++;
      stats.score = (stats.score * 0.8) + 0.2;
    } else {
      stats.failures++;
      stats.score = stats.score * 0.8;
    }

    this.providerCache.set(provider, stats);
    this.saveProviderCache();
  }

  /**
   * Handle video errors
   * @param {Event} event - Error event
   * @param {VideoController} controller - Associated controller
   */
  async handleVideoError(event, controller) {
    const error = new VideoError(
      event.error?.message || 'Video playback error',
      event.error?.code,
      true
    );

    const handled = await errorHandler.handleVideoError(error, {
      currentTime: controller.video.currentTime,
      src: controller.video.src
    });

    if (!handled) {
      eventEmitter.emit('video:error:fatal', { controller, error });
    }
  }

  /**
   * Handle provider errors
   * @param {ProviderError} error - Provider error
   * @param {Object} context - Error context
   */
  async handleProviderError(error, context) {
    const handled = await errorHandler.handleProviderError(error, context);
    if (!handled) {
      this.disableProvider(error.provider);
    }
  }

  /**
   * Check if a provider is disabled
   * @param {string} provider - Provider name
   * @returns {boolean} - Whether the provider is disabled
   */
  isProviderDisabled(provider) {
    const stats = this.providerCache.get(provider);
    return stats?.score < 0.1;
  }

  /**
   * Disable a provider
   * @param {string} provider - Provider to disable
   */
  disableProvider(provider) {
    const stats = this.providerCache.get(provider) || {};
    stats.score = 0;
    this.providerCache.set(provider, stats);
    this.saveProviderCache();
  }

  /**
   * Load provider cache from storage
   */
  loadProviderCache() {
    try {
      const cached = localStorage.getItem('providerCache');
      if (cached) {
        this.providerCache = new Map(JSON.parse(cached));
      }
    } catch (error) {
      console.warn('Failed to load provider cache:', error);
    }
  }

  /**
   * Save provider cache to storage
   */
  saveProviderCache() {
    try {
      localStorage.setItem('providerCache',
        JSON.stringify(Array.from(this.providerCache.entries()))
      );
    } catch (error) {
      console.warn('Failed to save provider cache:', error);
    }
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.activeControllers.forEach(controller => {
      controller.dispose();
    });
    this.activeControllers.clear();
    this.saveProviderCache();
  }
}

// Create and export singleton instance
const videoControllerFactory = new VideoControllerFactory();
export default videoControllerFactory;
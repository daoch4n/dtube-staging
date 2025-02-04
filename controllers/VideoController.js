import eventEmitter from '../utils/EventEmitter.js';
import { ErrorHandler, ProviderError } from '../utils/ErrorHandler.js';
import videoSourceManager from '../videoSources.js';
import { VIDEO_SETTINGS } from '../config/videoConfig.js';

export class VideoController {
  constructor(videoElement, providers = []) {
    this.video = videoElement;
    this.providers = providers;
    this.sourceManager = videoSourceManager;
    this.errorHandler = new ErrorHandler();
    this.bufferManager = createBufferManager(videoElement);
    this.qualityController = createQualityController(videoElement);
    
    // Provider state tracking
    this.providerScores = new Map();
    this.providerIndices = new Map();
    this.currentProvider = 0;
    this.currentCid = null;
    this.providerRetries = new Map();
    
    // Quality state
    this.currentQuality = null;
    
    this.initialize();
  }

  /**
   * Initialize video controller
   */
  initialize() {
    this.setupEventListeners();
    this.initializeProviderScores();
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    this.video.addEventListener('waiting', () => this.handleBuffering());
    this.video.addEventListener('playing', () => this.handlePlaying());
    this.video.addEventListener('error', (e) => this.handleVideoError(e));
    
    // Buffer monitoring
    setInterval(() => this.checkBuffer(), VIDEO_SETTINGS.BUFFER_CHECK_INTERVAL);
  }

  /**
   * Initialize provider scoring
   */
  initializeProviderScores() {
    this.providers.forEach(provider => {
      this.providerScores.set(provider.name, 1.0);
      this.providerRetries.set(provider.name, 0);
    });
  }

  /**
   * Load video from CID
   * @param {string} cid - Content ID to load
   */
  async load(cid) {
    try {
      this.currentCid = cid;
      const isValid = await this.sourceManager.validateCid(cid);
      
      if (!isValid) {
        throw new Error('Invalid CID');
      }

      const provider = await this.selectBestProvider(cid);
      const url = this.generateProviderUrl(cid, provider.name);
      
      this.video.src = url;
      await this.video.load();
      
      // Reset provider retries on successful load
      this.providerRetries.set(provider.name, 0);
      
      // Increase provider score on success
      this.updateProviderScore(provider.name, true);
      
      eventEmitter.emit('video:loaded', { cid, provider: provider.name });
      
    } catch (error) {
      await this.errorHandler.handleVideoError(error, { cid });
      throw error;
    }
  }

  /**
   * Generate provider URL
   * @param {string} cid - Content ID
   * @param {string} providerName - Provider name
   * @returns {string} - Complete URL
   */
  generateProviderUrl(cid, providerName) {
    return `https://${providerName}/ipfs/${cid}`;
  }

  /**
   * Select best available provider
   * @param {string} cid - Content ID
   * @returns {Object} - Selected provider
   */
  async selectBestProvider(cid) {
    const availableProviders = this.providers.filter(provider => 
      this.providerScores.get(provider.name) >= 0.5
    );

    if (availableProviders.length === 0) {
      return this.providers[this.currentProvider % this.providers.length];
    }

    // Sort by score with randomness factor
    availableProviders.sort((a, b) => 
      (this.providerScores.get(b.name) * Math.random()) - 
      (this.providerScores.get(a.name) * Math.random())
    );

    return availableProviders[0];
  }

  /**
   * Switch to next provider
   * @param {string} cid - Content ID
   * @returns {Promise<boolean>} - Success status
   */
  async switchProvider(cid) {
    try {
      const currentProvider = this.providers[this.currentProvider];
      
      // Update score for failed provider
      this.updateProviderScore(currentProvider.name, false);
      
      // Increment retry count
      const retries = this.providerRetries.get(currentProvider.name) || 0;
      this.providerRetries.set(currentProvider.name, retries + 1);

      if (retries >= VIDEO_SETTINGS.MAX_PROVIDER_RETRIES) {
        throw new ProviderError('Provider max retries exceeded', currentProvider.name);
      }

      const nextProvider = await this.selectBestProvider(cid);
      const url = this.generateProviderUrl(cid, nextProvider.name);
      
      const currentTime = this.video.currentTime;
      this.video.src = url;
      await this.video.load();
      this.video.currentTime = currentTime;
      
      eventEmitter.emit('provider:switched', {
        from: currentProvider.name,
        to: nextProvider.name,
        cid
      });

      return true;
    } catch (error) {
      await this.errorHandler.handleProviderError(error, { cid });
      return false;
    }
  }

  /**
   * Update provider reliability score
   * @param {string} providerName - Provider name
   * @param {boolean} success - Whether operation was successful
   */
  updateProviderScore(providerName, success) {
    const currentScore = this.providerScores.get(providerName) || 1.0;
    let newScore;

    if (success) {
      // Increase score on success, max 1.0
      newScore = Math.min(1.0, currentScore + (1 - currentScore) * 0.1);
    } else {
      // Decrease score on failure
      newScore = currentScore * VIDEO_SETTINGS.PROVIDER_SCORE_DECAY;
    }

    this.providerScores.set(providerName, newScore);
  }

  /**
   * Initialize video controller
   */
  initialize() {
    this.setupEventListeners();
    this.initializeProviderScores();

    // Listen for buffer events
    eventEmitter.on('buffer:low', this.handleLowBuffer.bind(this));
    eventEmitter.on('chunk:error', this.handleChunkError.bind(this));

    // Listen for quality events
    eventEmitter.on('quality:changed', this.handleQualityChange.bind(this));
    eventEmitter.on('quality:switching', this.handleQualitySwitching.bind(this));
    eventEmitter.on('frame:analyzed', this.handleFrameAnalysis.bind(this));

    // Initialize with default quality
    this.currentQuality = this.qualityController.getAvailableLevels()[0];
  }

  /**
   * Handle buffering state
   */
  handleBuffering() {
    eventEmitter.emit('video:buffering');

    // Set up stall detection
    setTimeout(() => {
      if (this.video.readyState < 3) {  // HAVE_FUTURE_DATA
        this.handleStall();
      }
    }, VIDEO_SETTINGS.BUFFER_STALL_TIMEOUT);
  }

  /**
   * Handle playing state
   */
  handlePlaying() {
    eventEmitter.emit('video:playing');
  }

  /**
   * Handle video error
   * @param {Event} event - Error event
   */
  async handleVideoError(event) {
    const error = event.error || new Error('Video playback error');
    await this.errorHandler.handleVideoError(error, {
      currentTime: this.video.currentTime,
      provider: this.providers[this.currentProvider].name
    });
  }

  /**
   * Handle low buffer condition
   * @param {Object} data - Buffer state data
   */
  async handleLowBuffer(data) {
    // Try switching provider if buffer is critically low
    if (data.current < VIDEO_SETTINGS.MINIMUM_BUFFER / 2) {
      await this.switchProvider(this.currentCid);
    }
  }

  /**
   * Handle chunk loading error
   * @param {Object} data - Chunk error data
   */
  async handleChunkError(data) {
    const error = new ProviderError('Chunk loading failed', this.providers[this.currentProvider].name);
    await this.errorHandler.handleProviderError(error, {
      chunkStart: data.start,
      originalError: data.error
    });

    // Try switching provider on chunk error
    await this.switchProvider(this.currentCid);
  }

  /**
   * Handle playback stall
   */
  async handleStall() {
    await this.switchProvider(this.currentCid);
  }

  /**
   * Handle quality change event
   * @param {Object} data - Quality change data
   */
  async handleQualityChange(data) {
    try {
      const { level, currentTime } = data;
      this.currentQuality = level;

      // Reload video with new quality
      const provider = await this.selectBestProvider(this.currentCid);
      const url = this.generateProviderUrl(this.currentCid, provider.name);
      
      this.video.src = url;
      await this.video.load();
      this.video.currentTime = currentTime;

      eventEmitter.emit('video:quality-changed', {
        quality: level,
        provider: provider.name
      });
    } catch (error) {
      eventEmitter.emit('video:quality-change-failed', {
        error,
        quality: data.level
      });
    }
  }

  /**
   * Handle quality switching event
   * @param {Object} data - Quality switching data
   */
  handleQualitySwitching(data) {
    const { from, to } = data;
    eventEmitter.emit('video:quality-switching', {
      from,
      to,
      provider: this.providers[this.currentProvider].name
    });
  }

  /**
   * Handle frame analysis results
   * @param {Object} data - Frame analysis data
   */
  handleFrameAnalysis(data) {
    const { analysis, quality } = data;
    
    // Update quality controller with analysis results
    this.qualityController.updateBandwidth(this.calculateEffectiveBandwidth(analysis));

    // Emit frame analysis results
    eventEmitter.emit('video:frame-analyzed', {
      analysis,
      quality,
      currentProvider: this.providers[this.currentProvider].name
    });
  }

  /**
   * Calculate effective bandwidth based on frame analysis
   * @param {Object} analysis - Frame analysis data
   * @returns {number} - Effective bandwidth in bits per second
   */
  calculateEffectiveBandwidth(analysis) {
    const { metrics } = analysis;
    const baseBandwidth = this.video.webkitVideoDecodedByteCount * 8 / this.video.currentTime;
    
    // Adjust bandwidth based on frame analysis metrics
    const complexityFactor = 1 - (metrics.complexity * 0.5);  // Reduce bandwidth for complex scenes
    const motionFactor = 1 - (metrics.motion * 0.3);         // Reduce bandwidth for high motion
    const processingFactor = Math.min(60 / metrics.processingTime, 1);  // Consider processing performance

    return baseBandwidth * complexityFactor * motionFactor * processingFactor;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.bufferManager.dispose();
    this.video.removeEventListener('waiting', this.handleBuffering);
    this.video.removeEventListener('playing', this.handlePlaying);
    this.video.removeEventListener('error', this.handleVideoError);
    eventEmitter.off('buffer:low', this.handleLowBuffer);
    eventEmitter.off('chunk:error', this.handleChunkError);
    this.providers = [];
    this.providerScores.clear();
    this.providerRetries.clear();
    this.currentCid = null;
  }
}
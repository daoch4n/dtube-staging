import eventEmitter from '../utils/EventEmitter.js';
import { VIDEO_SETTINGS } from '../config/videoConfig.js';

/**
 * Manages video quality adaptation
 */
export class QualityController {
    constructor(videoElement) {
        this.video = videoElement;
        this.currentQuality = null;
        this.availableQualities = VIDEO_SETTINGS.QUALITY.QUALITY_LEVELS;
        this.adaptationEnabled = true;
        this.metrics = {
            bandwidth: 0,
            bufferLevel: 0,
            frameDrops: 0,
            lastSwitch: 0
        };
        this.initialize();
    }

    /**
     * Initialize quality controller
     */
    initialize() {
        this.setupEventListeners();
        this.startQualityMonitoring();
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Listen for frame analysis results
        eventEmitter.on('frame:analyzed', this.handleFrameAnalysis.bind(this));
        
        // Listen for buffer updates
        eventEmitter.on('buffer:update', this.handleBufferUpdate.bind(this));
        
        // Monitor frame drops
        this.video.addEventListener('waiting', () => this.metrics.frameDrops++);
    }

    /**
     * Start quality monitoring
     */
    startQualityMonitoring() {
        setInterval(() => {
            if (this.adaptationEnabled) {
                this.evaluateQuality();
            }
        }, VIDEO_SETTINGS.QUALITY.AUTO_QUALITY_INTERVAL);
    }

    /**
     * Handle frame analysis results
     * @param {Object} data - Frame analysis data
     */
    handleFrameAnalysis(data) {
        // Update metrics based on frame analysis
        this.metrics.frameRate = data.frameRate;
        this.metrics.complexity = data.complexity;
    }

    /**
     * Handle buffer update
     * @param {Object} data - Buffer state data
     */
    handleBufferUpdate(data) {
        this.metrics.bufferLevel = data.current;
    }

    /**
     * Evaluate and potentially switch quality
     */
    async evaluateQuality() {
        // Don't switch too frequently
        if (Date.now() - this.metrics.lastSwitch < VIDEO_SETTINGS.QUALITY.MIN_SWITCH_INTERVAL) {
            return;
        }

        const currentLevel = this.getCurrentQualityLevel();
        const recommendedLevel = this.getRecommendedQuality();

        if (recommendedLevel && recommendedLevel !== currentLevel) {
            await this.switchQuality(recommendedLevel);
        }
    }

    /**
     * Get recommended quality level based on conditions
     * @returns {Object} - Recommended quality level
     */
    getRecommendedQuality() {
        // Get sorted quality levels
        const levels = [...this.availableQualities].sort((a, b) => a.bitrate - b.bitrate);
        
        // Calculate effective bandwidth (considering frame drops)
        const effectiveBandwidth = this.metrics.bandwidth * 
            (1 - Math.min(this.metrics.frameDrops / 100, 0.5));

        // Find highest quality level that's below our effective bandwidth
        let recommended = levels[0];  // Start with lowest quality
        
        for (const level of levels) {
            if (level.bitrate <= effectiveBandwidth * 0.8) {  // Use 80% of bandwidth
                recommended = level;
            } else {
                break;
            }
        }

        // Consider buffer level
        if (this.metrics.bufferLevel < VIDEO_SETTINGS.QUALITY.BUFFER_THRESHOLD_LOW) {
            // Switch down if buffer is low
            const currentIndex = levels.indexOf(this.currentQuality);
            if (currentIndex > 0) {
                recommended = levels[currentIndex - 1];
            }
        }

        return recommended;
    }

    /**
     * Switch to new quality level
     * @param {Object} level - Quality level to switch to
     */
    async switchQuality(level) {
        try {
            const currentTime = this.video.currentTime;
            
            // Emit quality switch start event
            eventEmitter.emit('quality:switching', {
                from: this.currentQuality,
                to: level
            });

            // Update quality
            this.currentQuality = level;
            this.metrics.lastSwitch = Date.now();

            // Request source update with new quality
            eventEmitter.emit('quality:changed', {
                level,
                currentTime
            });

        } catch (error) {
            console.error('Quality switch failed:', error);
            eventEmitter.emit('quality:switch-failed', {
                error,
                level
            });
        }
    }

    /**
     * Get current quality level
     * @returns {Object} - Current quality level
     */
    getCurrentQualityLevel() {
        return this.currentQuality || this.availableQualities[0];
    }

    /**
     * Enable/disable automatic quality adaptation
     * @param {boolean} enabled - Whether to enable adaptation
     */
    setAutoQuality(enabled) {
        this.adaptationEnabled = enabled;
        eventEmitter.emit('quality:auto', {
            enabled,
            current: this.currentQuality
        });
    }

    /**
     * Force specific quality level
     * @param {Object} level - Quality level to force
     */
    forceQuality(level) {
        if (!this.availableQualities.includes(level)) {
            throw new Error('Invalid quality level');
        }
        this.adaptationEnabled = false;
        this.switchQuality(level);
    }

    /**
     * Update bandwidth estimate
     * @param {number} bandwidth - Bandwidth in bits per second
     */
    updateBandwidth(bandwidth) {
        this.metrics.bandwidth = bandwidth;
    }

    /**
     * Get available quality levels
     * @returns {Array} - Array of available quality levels
     */
    getAvailableLevels() {
        return this.availableQualities;
    }

    /**
     * Dispose of resources
     */
    dispose() {
        eventEmitter.off('frame:analyzed', this.handleFrameAnalysis);
        eventEmitter.off('buffer:update', this.handleBufferUpdate);
        this.video.removeEventListener('waiting', this.handleWaiting);
    }
}

// Create and export factory function
export function createQualityController(videoElement) {
    return new QualityController(videoElement);
}
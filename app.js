import videoControllerFactory from './controllers/VideoControllerFactory.js';
import UIController from './controllers/UIController.js';
import eventEmitter from './utils/EventEmitter.js';
import errorHandler from './utils/ErrorHandler.js';
import { FrameRateLimiter, ColorAnalyzer } from './utils/performance.js';
import { PERFORMANCE, UI, VIDEO } from './config/config.js';
import videoSourceManager from './videoSources.js';

// Global state (CRITICAL: these must be global)
let isSeeking = false;
let isRecovering = false;
let bufferingUpdateScheduled = false;
const providerIndices = new Map();
let isDraggingProgress = false;

// Video source management
let currentVideoIndex = 0;
const videoSources = [];

/**
 * Main application class
 */
class VideoApp {
    constructor(containerId = 'video-player') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container element #${containerId} not found`);
        }

        // Create wrapper first
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'video-wrapper';
        this.container.appendChild(this.wrapper);

        // Initialize video element inside wrapper
        this.videoElement = document.createElement('video');
        this.videoElement.playsInline = true;
        this.wrapper.appendChild(this.videoElement);

        this.initialize();
    }

    /**
     * Initialize the application
     */
    initialize() {
        // Initialize controllers
        this.videoController = videoControllerFactory.createController(this.videoElement);
        this.uiController = new UIController(this.container, this.wrapper);

        // Initialize utilities
        this.frameLimiter = new FrameRateLimiter(30);
        this.colorAnalyzer = new ColorAnalyzer(UI.SAMPLING.WIDTH);

        this.setupEventListeners();
        this.setupKeyboardControls();
        this.setupColorAnalysis();

        // Load initial video sources
        this.loadVideoSources();
    }

    /**
     * Load video sources
     */
    async loadVideoSources() {
        try {
            const sources = await videoSourceManager.getValidCids();
            videoSources.push(...sources);
            if (videoSources.length > 0) {
                this.loadVideo(videoSources[0]);
            }
        } catch (error) {
            console.error('Failed to load video sources:', error);
        }
    }

    /**
     * Load next video
     */
    loadNextVideo() {
        if (videoSources.length === 0) return;
        
        currentVideoIndex = (currentVideoIndex + 1) % videoSources.length;
        this.loadVideo(videoSources[currentVideoIndex]);
    }

    /**
     * Load previous video
     */
    loadPrevVideo() {
        if (videoSources.length === 0) return;
        
        currentVideoIndex = (currentVideoIndex - 1 + videoSources.length) % videoSources.length;
        this.loadVideo(videoSources[currentVideoIndex]);
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Register all video event listeners
        this.registerVideoEventListeners();

        // Playback control events
        eventEmitter.on('video:toggle-play', () => {
            if (this.videoElement.paused) {
                this.videoElement.play().catch(error => {
                    errorHandler.handleVideoError(error);
                });
            } else {
                this.videoElement.pause();
            }
        });

        eventEmitter.on('video:seek-percent', (percent) => {
            const time = this.videoElement.duration * percent;
            this.seekTo(time);
        });

        eventEmitter.on('video:seek-forward', () => {
            this.secsSeek(10);
        });

        eventEmitter.on('video:seek-backward', () => {
            this.secsSeek(-10);
        });

        eventEmitter.on('video:volume-change', (volume) => {
            this.videoElement.volume = volume;
            this.videoElement.muted = volume === 0;
        });

        // Provider events
        eventEmitter.on('provider:disabled', (provider) => {
            console.warn(`Provider ${provider} has been disabled due to errors`);
        });
    }

    /**
     * Register video event listeners
     */
    registerVideoEventListeners() {
        this.videoElement.addEventListener('timeupdate', () => {
            eventEmitter.emit('video:timeupdate', {
                currentTime: this.videoElement.currentTime,
                duration: this.videoElement.duration
            });
        });

        this.videoElement.addEventListener('play', () => {
            eventEmitter.emit('video:play');
        });

        this.videoElement.addEventListener('pause', () => {
            eventEmitter.emit('video:pause');
        });

        this.videoElement.addEventListener('waiting', () => {
            if (!bufferingUpdateScheduled && !isSeeking) {
                bufferingUpdateScheduled = true;
                setTimeout(() => {
                    if (this.videoElement.readyState < 4 && !isRecovering && !isSeeking) {
                        isRecovering = true;
                        console.log('Attempting buffer recovery...');
                        this.handleBufferRecovery();
                    }
                    bufferingUpdateScheduled = false;
                }, 1000);
            }
        });

        this.videoElement.addEventListener('seeking', () => {
            isSeeking = true;
            this.uiController.handleBufferingStart(true);
            eventEmitter.emit('video:seeking-start');
        });

        this.videoElement.addEventListener('seeked', () => {
            isSeeking = false;
            this.uiController.handleBufferingEnd();
            eventEmitter.emit('video:seeking-end');
        });

        this.videoElement.addEventListener('ended', () => {
            this.loadNextVideo();
        });

        this.videoElement.addEventListener('error', (e) => {
            errorHandler.handleVideoError(e.error || new Error('Video playback error'));
        });
    }

    /**
     * Handle buffer recovery
     */
    async handleBufferRecovery() {
        const startTime = performance.now();
        try {
            if (isRecovering) return;
            isRecovering = true;
            
            const currentTime = this.videoElement.currentTime;
            const currentCid = videoSources[currentVideoIndex];
            const bufferTimeout = 1500;
            
            const recoverySuccess = await Promise.race([
                new Promise(resolve => {
                    this.videoElement.addEventListener('playing', () => resolve(true), { once: true });
                    this.videoElement.addEventListener('error', () => resolve(false), { once: true });
                }),
                new Promise(resolve => setTimeout(() => resolve(false), bufferTimeout))
            ]);

            if (!recoverySuccess) {
                await this.videoController.switchProvider(currentCid);
                this.videoElement.currentTime = currentTime;
                await this.videoElement.play();
            }
        } finally {
            const duration = performance.now() - startTime;
            performance.mark('buffer-recovery-end', {
                detail: {
                    duration,
                    success: !isRecovering,
                    videoTime: this.videoElement.currentTime
                }
            });
            isRecovering = false;
        }
    }

    /**
     * Seek by seconds
     * @param {number} seconds - Seconds to seek by
     */
    secsSeek(seconds) {
        const newTime = Math.max(0, this.videoElement.currentTime + seconds);
        this.seekTo(newTime);
    }

    /**
     * Seek to specific time
     * @param {number} time - Time to seek to
     */
    seekTo(time) {
        this.videoElement.currentTime = Math.max(0, Math.min(time, this.videoElement.duration));
        isSeeking = true;
        setTimeout(() => isSeeking = false, 100);
    }

    /**
     * Set up keyboard controls
     */
    setupKeyboardControls() {
        document.addEventListener('keydown', (event) => {
            switch (event.key.toLowerCase()) {
                case ' ':
                case 'k':
                    event.preventDefault();
                    eventEmitter.emit('video:toggle-play');
                    break;
                case 'arrowleft':
                    event.preventDefault();
                    eventEmitter.emit('video:seek-backward');
                    break;
                case 'arrowright':
                    event.preventDefault();
                    eventEmitter.emit('video:seek-forward');
                    break;
                case 'f':
                    event.preventDefault();
                    this.container.requestFullscreen();
                    break;
                case 'm':
                    event.preventDefault();
                    this.videoElement.muted = !this.videoElement.muted;
                    break;
            }
        });
    }

    /**
     * Set up color analysis for video frames
     */
    setupColorAnalysis() {
        let animationFrame;
        const analyzeFrame = () => {
            if (this.videoElement.paused || !this.frameLimiter.shouldProcessFrame()) {
                animationFrame = requestAnimationFrame(analyzeFrame);
                return;
            }

            try {
                const hue = this.colorAnalyzer.getDominantHue(this.videoElement);
                this.container.style.setProperty('--video-hue', hue);
            } catch (error) {
                console.warn('Frame analysis error:', error);
            }

            animationFrame = requestAnimationFrame(analyzeFrame);
        };

        this.videoElement.addEventListener('play', () => {
            animationFrame = requestAnimationFrame(analyzeFrame);
        });

        this.videoElement.addEventListener('pause', () => {
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
            }
        });
    }

    /**
     * Load and play a video
     * @param {string} videoId - Video ID or CID
     * @returns {Promise<void>}
     */
    async loadVideo(videoId) {
        try {
            await this.videoController.load(videoId);
            await this.videoElement.play();
        } catch (error) {
            errorHandler.handleVideoError(error);
            this.loadNextVideo(); // Try next video on error
        }
    }

    /**
     * Clean up resources
     */
    dispose() {
        this.videoController.dispose();
        this.uiController.dispose();
        this.colorAnalyzer.dispose();
        this.container.innerHTML = '';
    }
}

// Create and export singleton instance
const videoApp = new VideoApp();
export default videoApp;

// Auto-initialize if DOM is ready
if (document.readyState === 'complete') {
    videoApp.initialize();
} else {
    document.addEventListener('DOMContentLoaded', () => {
        videoApp.initialize();
    });
}

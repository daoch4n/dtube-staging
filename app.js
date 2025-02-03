import videoControllerFactory from './controllers/VideoControllerFactory.js';
import UIController from './controllers/UIController.js';
import eventEmitter from './utils/EventEmitter.js';
import errorHandler from './utils/ErrorHandler.js';
import { FrameRateLimiter, ColorAnalyzer } from './utils/performance.js';
import { PERFORMANCE, UI, VIDEO } from './config/config.js';
import videoSourceManager from './videoSources.js';

// Global state
let isSeeking = false;
let isRecovering = false;
let bufferingUpdateScheduled = false;
const providerIndices = new Map();

/**
 * Main application class
 */
class VideoApp {
    constructor(containerId = 'video-player') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container element #${containerId} not found`);
        }

        this.videoElement = document.createElement('video');
        this.videoElement.playsInline = true;
        this.container.appendChild(this.videoElement);

        this.initialize();
    }

    /**
     * Initialize the application
     */
    initialize() {
        // Initialize controllers
        this.videoController = videoControllerFactory.createController(this.videoElement);
        this.uiController = new UIController(this.container);

        // Initialize utilities
        this.frameLimiter = new FrameRateLimiter(30);
        this.colorAnalyzer = new ColorAnalyzer(UI.SAMPLING.WIDTH);

        this.setupEventListeners();
        this.setupKeyboardControls();
        this.setupColorAnalysis();
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
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
            this.videoElement.currentTime = time;
            isSeeking = true;
            setTimeout(() => isSeeking = false, 100);
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

        // Video state events
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

        // Buffer and seeking events
        this.videoElement.addEventListener('seeking', () => {
            isSeeking = true;
            if (this.uiController) this.uiController.handleBufferingStart(true);
        });

        this.videoElement.addEventListener('seeked', () => {
            isSeeking = false;
            if (this.uiController) this.uiController.handleBufferingEnd();
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

        // Error handling
        eventEmitter.on('error:fatal', (error) => {
            console.error('Fatal error:', error);
            this.showErrorMessage('An error occurred while playing the video');
        });

        // Provider events
        eventEmitter.on('provider:disabled', (provider) => {
            console.warn(`Provider ${provider} has been disabled due to errors`);
        });
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
     * Handle buffer recovery
     */
    async handleBufferRecovery() {
        if (isRecovering) return;
        isRecovering = true;

        const currentTime = this.videoElement.currentTime;
        const currentCid = this.videoController.getCurrentCid();
        const bufferTimeout = 1000;
        const recoveryAbortController = new AbortController();

        try {
            await Promise.race([
                new Promise(resolve => {
                    this.videoElement.addEventListener('playing', resolve, { once: true });
                    this.videoElement.addEventListener('error', resolve, { once: true });
                }),
                new Promise((_, reject) => {
                    setTimeout(() => {
                        reject(new Error('Buffer recovery timeout'));
                    }, bufferTimeout);
                })
            ]).catch(async (error) => {
                if (!recoveryAbortController.signal.aborted) {
                    console.log('Attempting buffer recovery for current video...');
                    
                    // Reset provider index for this CID
                    providerIndices.set(currentCid, 0);

                    // Get new URL from different provider
                    const newUrl = this.videoController.generateProviderUrl(currentCid, 
                        JSON.parse(localStorage.getItem(VIDEO.CID_VALID_CACHE_KEY))?.[currentCid]?.lastWorkingProvider
                    );
                    
                    // Preserve playback state
                    this.videoElement.src = newUrl;
                    this.videoElement.currentTime = currentTime;
                    
                    // Wait for enough data to resume
                    await new Promise((resolve) => {
                        this.videoElement.addEventListener('canplaythrough', resolve, { once: true });
                    });
                    
                    // Attempt playback with 3 retries
                    for (let attempt = 0; attempt < 3; attempt++) {
                        try {
                            await this.videoElement.play();
                            break;
                        } catch (error) {
                            if (attempt === 2) {
                                console.log('Final recovery attempt failed, switching video');
                                this.loadNextVideo();
                            }
                        }
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            });
        } finally {
            isRecovering = false;
            recoveryAbortController.abort();
        }
    }

    /**
     * Seek by seconds
     * @param {number} seconds - Seconds to seek
     */
    secsSeek(seconds) {
        this.videoElement.currentTime = Math.max(0, this.videoElement.currentTime + seconds);
        isSeeking = true;
        setTimeout(() => isSeeking = false, 100);
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
        }
    }

    /**
     * Show error message to user
     * @param {string} message - Error message
     */
    showErrorMessage(message) {
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = message;

        this.container.appendChild(errorElement);
        setTimeout(() => {
            errorElement.remove();
        }, 5000);
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

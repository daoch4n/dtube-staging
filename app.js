import videoControllerFactory from './controllers/VideoControllerFactory.js';
import UIController from './controllers/UIController.js';
import eventEmitter from './utils/EventEmitter.js';
import errorHandler from './utils/ErrorHandler.js';
import { FrameRateLimiter, ColorAnalyzer } from './utils/performance.js';
import { PERFORMANCE, UI } from './config/config.js';
import './videoSources.js';

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
        });

        eventEmitter.on('video:seek-forward', () => {
            this.videoElement.currentTime = Math.min(
                this.videoElement.currentTime + 10,
                this.videoElement.duration
            );
        });

        eventEmitter.on('video:seek-backward', () => {
            this.videoElement.currentTime = Math.max(
                this.videoElement.currentTime - 10,
                0
            );
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

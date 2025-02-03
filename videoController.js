import eventEmitter from './utils/EventEmitter.js';
import { VideoError } from './utils/ErrorHandler.js';
import { AnimationLoop } from './utils/performance.js';
import { VIDEO } from './config/config.js';
import videoSourceManager from './videoSources.js';

/**
 * Manages video playback and state
 */
export class VideoController {
    constructor(videoElement, providers = []) {
        this.video = videoElement;
        this.providers = providers;
        this.currentProvider = 0;
        this.isSeeking = false;
        this.currentCid = null;
        this.bufferCheckInterval = null;
        this.initialize();
    }

    /**
     * Initialize video controller
     */
    initialize() {
        this.setupVideoElement();
        this.setupEventListeners();
        this.setupBufferCheck();
    }

    /**
     * Set up video element properties
     */
    setupVideoElement() {
        this.video.preload = 'auto';
        this.video.playsInline = true;
        this.video.setAttribute('crossorigin', 'anonymous');
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Seeking events
        this.video.addEventListener('seeking', () => {
            this.isSeeking = true;
            eventEmitter.emit('video:seeking', {
                currentTime: this.video.currentTime,
                duration: this.video.duration
            });
        });

        this.video.addEventListener('seeked', () => {
            this.isSeeking = false;
            eventEmitter.emit('video:seeked', {
                currentTime: this.video.currentTime,
                duration: this.video.duration
            });
        });

        // Buffer events
        this.video.addEventListener('waiting', () => {
            if (!this.isSeeking) {
                this.checkBufferStatus();
            }
        });

        this.video.addEventListener('canplay', () => {
            eventEmitter.emit('video:can-play');
        });

        // Error handling
        this.video.addEventListener('error', (e) => {
            const error = new VideoError(
                'Video playback error',
                this.video.error?.code,
                true
            );
            eventEmitter.emit('video:error', error);
        });
    }

    /**
     * Set up buffer checking
     */
    setupBufferCheck() {
        this.bufferCheckInterval = setInterval(() => {
            this.checkBufferStatus();
        }, VIDEO.BUFFER_CHECK_DELAY);
    }

    /**
     * Load video from given ID/CID
     * @param {string} videoId - Video ID or CID
     * @returns {Promise<void>}
     */
    async load(videoId) {
        this.currentCid = videoId;
        this.currentProvider = 0;
        await this.tryLoadWithProvider(videoId);
    }

    /**
     * Try loading video with current provider
     * @param {string} videoId - Video ID or CID
     * @returns {Promise<void>}
     */
    async tryLoadWithProvider(videoId) {
        if (this.currentProvider >= this.providers.length) {
            throw new VideoError('All providers failed', 'PROVIDER_FAILURE', false);
        }

        const provider = this.providers[this.currentProvider];

        try {
            const response = await this.fetchVideoMetadata(videoId, provider);
            await this.setupVideoSource(response);
            // Store last working provider
            const cache = JSON.parse(localStorage.getItem(VIDEO.CID_VALID_CACHE_KEY) || '{}');
            cache[videoId] = {
                ...cache[videoId],
                lastWorkingProvider: provider.name
            };
            localStorage.setItem(VIDEO.CID_VALID_CACHE_KEY, JSON.stringify(cache));
        } catch (error) {
            console.warn(`Provider ${provider.name} failed:`, error);
            this.currentProvider++;
            return this.tryLoadWithProvider(videoId);
        }
    }

    /**
     * Generate provider URL for CID
     * @param {string} cid - Content ID
     * @param {string} preferredProvider - Preferred provider name
     * @returns {string} - Provider URL
     */
    generateProviderUrl(cid, preferredProvider) {
        const provider = this.providers.find(p => p.name === preferredProvider) 
            || this.providers[this.currentProvider];
        return provider.getUrl(cid);
    }

    /**
     * Get current CID
     * @returns {string|null} - Current content ID
     */
    getCurrentCid() {
        return this.currentCid;
    }

    /**
     * Seek to specific time with timeout
     * @param {number} time - Time to seek to
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<void>}
     */
    async seekTo(time, timeout = 3000) {
        if (!this.video.seekable) return;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.video.removeEventListener('seeked', onSeeked);
                reject(new Error('Seek timeout'));
            }, timeout);

            const onSeeked = () => {
                clearTimeout(timer);
                this.video.removeEventListener('seeked', onSeeked);
                resolve();
            };
            
            this.video.addEventListener('seeked', onSeeked, { once: true });
            this.video.currentTime = time;
            
            // Add seeking state management
            if (!this.video.seeking) {
                this.isSeeking = true;
                const onSeeking = () => {
                    this.isSeeking = true;
                    this.video.removeEventListener('seeking', onSeeking);
                };
                this.video.addEventListener('seeking', onSeeking, { once: true });
            }
        }).finally(() => {
            this.isSeeking = false;
        });
    }

    /**
     * Seek by delta with timeout
     * @param {number} delta - Time delta to seek by
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<void>}
     */
    async seekBy(delta, timeout = 3000) {
        return this.seekTo(
            Math.max(0, Math.min(this.video.duration, this.video.currentTime + delta)),
            timeout
        );
    }

    /**
     * Fetch video metadata from provider
     * @param {string} videoId - Video ID or CID
     * @param {Object} provider - Provider object
     * @returns {Promise<Response>}
     */
    async fetchVideoMetadata(videoId, provider) {
        const response = await provider.fetch(videoId, 0, 0);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        // Check for video mime type
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('video/')) {
            throw new Error('Invalid content type');
        }

        return response;
    }

    /**
     * Set up video source with response data
     * @param {Response} response - Fetch response
     * @returns {Promise<void>}
     */
    async setupVideoSource(response) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        return new Promise((resolve, reject) => {
            const cleanup = () => {
                this.video.removeEventListener('loadedmetadata', onLoad);
                this.video.removeEventListener('error', onError);
            };

            const onLoad = () => {
                cleanup();
                resolve();
            };

            const onError = () => {
                cleanup();
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load video'));
            };

            this.video.addEventListener('loadedmetadata', onLoad);
            this.video.addEventListener('error', onError);
            this.video.src = url;
        });
    }

    /**
     * Check video buffer status
     */
    checkBufferStatus() {
        if (!this.video.buffered.length) return;

        const currentTime = this.video.currentTime;
        const buffered = this.video.buffered;
        let isInBuffer = false;

        for (let i = 0; i < buffered.length; i++) {
            if (currentTime >= buffered.start(i) && currentTime <= buffered.end(i)) {
                isInBuffer = true;
                break;
            }
        }

        if (!isInBuffer && !this.isSeeking) {
            eventEmitter.emit('video:buffer-stalled', {
                currentTime: currentTime,
                buffered: Array.from({ length: buffered.length }, (_, i) => ({
                    start: buffered.start(i),
                    end: buffered.end(i)
                }))
            });
        }
    }

    /**
     * Get current playback state
     * @returns {Object} - Playback state
     */
    getState() {
        return {
            currentTime: this.video.currentTime,
            duration: this.video.duration,
            paused: this.video.paused,
            ended: this.video.ended,
            volume: this.video.volume,
            muted: this.video.muted,
            playbackRate: this.video.playbackRate,
            seeking: this.isSeeking,
            currentProvider: this.providers[this.currentProvider]?.name,
            currentCid: this.currentCid
        };
    }

    /**
     * Clean up resources
     */
    dispose() {
        clearInterval(this.bufferCheckInterval);
        if (this.video.src) {
            URL.revokeObjectURL(this.video.src);
        }
        this.video.src = '';
    }
}
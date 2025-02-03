import eventEmitter from './utils/EventEmitter.js';
import { VideoError, ProviderError } from './utils/ErrorHandler.js';
import { VIDEO } from './config/config.js';

/**
 * Manages video playback and state
 */
export class VideoController {
    constructor(videoElement, providers = []) {
        this.video = videoElement;
        this.providers = providers;
        this.currentProvider = 0;
        this.currentCid = null;
        this.debug = true; // Set to false to disable logging
        this.initialize();
    }

    /**
     * Initialize video controller
     */
    initialize() {
        this.setupVideoElement();
        this.setupEventListeners();
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
        // Buffer events
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
        // Add provider scoring system
        const providerScores = new Map();

        // Sort providers by score before trying
        const sortedProviders = [...this.providers].sort((a, b) => 
            (providerScores.get(b.name) || 0) - (providerScores.get(a.name) || 0)
        );

        for (const provider of sortedProviders) {
            try {
                const response = await provider.fetch(videoId);
                // Update provider score on success
                providerScores.set(provider.name, (providerScores.get(provider.name) || 100) + 5);
                return this.setupVideoSource(response);
            } catch (error) {
                // Penalize failed provider
                providerScores.set(provider.name, (providerScores.get(provider.name) || 100) - 20);
                eventEmitter.emit('provider:error', {
                    error: new ProviderError(error.message, provider.name),
                    context: { videoId }
                });
            }
        }
        throw new VideoError('All providers failed', 'PROVIDER_FAILURE');
    }

    /**
     * Get current CID
     * @returns {string|null} Current content ID
     */
    getCurrentCid() {
        return this.currentCid;
    }

    /**
     * Generate provider URL
     * @param {string} cid Content ID
     * @param {string} preferredProvider Preferred provider name 
     * @returns {string} Provider URL
     */
    generateProviderUrl(cid, preferredProvider) {
        const provider = this.providers.find(p => p.name === preferredProvider) 
            || this.providers[this.currentProvider];
            
        if (!provider) {
            throw new Error('No valid provider available');
        }

        // Use the provider's URL builder if available, otherwise construct default URL
        if (provider.getUrl) {
            return provider.getUrl(cid);
        }

        // Default URL construction (matches factory's buildProviderUrl logic)
        const providerName = provider.name.toLowerCase();
        if (providerName === 'ipfs.io') {
            return `https://ipfs.io/ipfs/${cid}`;
        }
        return ["dweb.link", "flk-ipfs.xyz"].includes(providerName)
            ? `https://${cid}.ipfs.${providerName}`
            : `https://ipfs.${providerName}/ipfs/${cid}`;
    }

    /**
     * Set up video source with response data
     * @param {Response} response - Fetch response
     * @returns {Promise<void>}
     */
    async setupVideoSource(response) {
        // Check for video mime type
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('video/')) {
            throw new Error('Invalid content type');
        }

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
            currentProvider: this.providers[this.currentProvider]?.name,
            currentCid: this.currentCid
        };
    }

    /**
     * Clean up resources
     */
    dispose() {
        if (this.video.src) {
            URL.revokeObjectURL(this.video.src);
        }
        this.video.src = '';
    }
}
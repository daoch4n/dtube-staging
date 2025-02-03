import eventEmitter from './EventEmitter.js';
import { VIDEO_SETTINGS } from '../config/videoConfig.js';
import { BufferError } from './ErrorHandler.js';

/**
 * Manages video buffer state and chunk loading
 */
export class BufferManager {
    constructor(videoElement) {
        this.video = videoElement;
        this.chunks = new Map();
        this.loadingChunks = new Set();
        this.activeRequests = new Map();
        this.bufferState = {
            current: 0,
            optimal: VIDEO_SETTINGS.OPTIMAL_BUFFER,
            minimum: VIDEO_SETTINGS.MINIMUM_BUFFER
        };
        this.initialize();
    }

    /**
     * Initialize buffer manager
     */
    initialize() {
        this.setupEventListeners();
        this.startBufferMonitoring();
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        this.video.addEventListener('timeupdate', () => this.updateBufferState());
        this.video.addEventListener('seeking', () => this.handleSeeking());
        this.video.addEventListener('progress', () => this.handleProgress());
    }

    /**
     * Start buffer monitoring
     */
    startBufferMonitoring() {
        setInterval(() => this.monitorBuffer(), VIDEO_SETTINGS.BUFFER_CHECK_INTERVAL);
    }

    /**
     * Update buffer state
     */
    updateBufferState() {
        if (!this.video.buffered.length) return;

        const currentTime = this.video.currentTime;
        const buffered = this.video.buffered.end(this.video.buffered.length - 1);
        const bufferAhead = buffered - currentTime;

        this.bufferState.current = bufferAhead;

        eventEmitter.emit('buffer:update', {
            current: bufferAhead,
            optimal: this.bufferState.optimal,
            minimum: this.bufferState.minimum
        });

        // Check if we need more buffer
        if (bufferAhead < this.bufferState.optimal) {
            this.loadNextChunk();
        }
    }

    /**
     * Handle seeking
     */
    handleSeeking() {
        this.abortPendingRequests();
        this.loadingChunks.clear();
        this.loadNextChunk();
    }

    /**
     * Handle progress event
     */
    handleProgress() {
        this.updateBufferState();
    }

    /**
     * Monitor buffer health
     */
    monitorBuffer() {
        if (this.bufferState.current < this.bufferState.minimum) {
            this.handleLowBuffer();
        }

        // Clean up old chunks
        this.cleanupBuffer();
    }

    /**
     * Handle low buffer condition
     */
    handleLowBuffer() {
        eventEmitter.emit('buffer:low', {
            current: this.bufferState.current,
            minimum: this.bufferState.minimum
        });

        // Adjust chunk loading priority
        this.loadNextChunk(true);
    }

    /**
     * Load next video chunk
     * @param {boolean} highPriority - Whether this is a high priority load
     */
    async loadNextChunk(highPriority = false) {
        if (this.loadingChunks.size >= VIDEO_SETTINGS.NETWORK.CONCURRENT_CHUNKS) {
            return;
        }

        const nextChunkStart = this.getNextChunkStart();
        if (!nextChunkStart || this.loadingChunks.has(nextChunkStart)) {
            return;
        }

        this.loadingChunks.add(nextChunkStart);

        try {
            const chunkSize = VIDEO_SETTINGS.NETWORK.CHUNK_SIZE;
            const controller = new AbortController();
            this.activeRequests.set(nextChunkStart, controller);

            const response = await fetch(this.getChunkUrl(nextChunkStart), {
                signal: controller.signal,
                priority: highPriority ? 'high' : 'auto'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const chunk = await response.arrayBuffer();
            this.chunks.set(nextChunkStart, chunk);
            this.loadingChunks.delete(nextChunkStart);
            this.activeRequests.delete(nextChunkStart);

            eventEmitter.emit('chunk:loaded', {
                start: nextChunkStart,
                size: chunk.byteLength
            });

        } catch (error) {
            if (error.name === 'AbortError') {
                return;
            }

            this.loadingChunks.delete(nextChunkStart);
            this.activeRequests.delete(nextChunkStart);
            
            eventEmitter.emit('chunk:error', {
                start: nextChunkStart,
                error
            });

            throw new BufferError('Chunk loading failed', nextChunkStart);
        }
    }

    /**
     * Get URL for chunk
     * @param {number} start - Chunk start time
     * @returns {string} - Chunk URL
     */
    getChunkUrl(start) {
        // Implement based on your chunking strategy
        return `${this.video.currentSrc}#t=${start}`;
    }

    /**
     * Get next chunk start time
     * @returns {number} - Next chunk start time
     */
    getNextChunkStart() {
        if (!this.video.buffered.length) {
            return 0;
        }

        const currentTime = this.video.currentTime;
        const buffered = this.video.buffered;

        for (let i = 0; i < buffered.length; i++) {
            if (buffered.end(i) > currentTime) {
                return Math.ceil(buffered.end(i));
            }
        }

        return Math.ceil(currentTime);
    }

    /**
     * Abort pending chunk requests
     */
    abortPendingRequests() {
        for (const controller of this.activeRequests.values()) {
            controller.abort();
        }
        this.activeRequests.clear();
    }

    /**
     * Clean up old chunks
     */
    cleanupBuffer() {
        const currentTime = this.video.currentTime;
        let totalSize = 0;

        // Calculate total buffer size
        for (const [start, chunk] of this.chunks) {
            totalSize += chunk.byteLength;
        }

        // Remove old chunks if buffer is too large
        if (totalSize > VIDEO_SETTINGS.MAX_BUFFER_SIZE) {
            for (const [start, chunk] of this.chunks) {
                if (start < currentTime - 30) {  // Keep last 30 seconds
                    this.chunks.delete(start);
                    totalSize -= chunk.byteLength;
                }
                if (totalSize <= VIDEO_SETTINGS.MAX_BUFFER_SIZE) {
                    break;
                }
            }
        }
    }

    /**
     * Dispose of resources
     */
    dispose() {
        this.abortPendingRequests();
        this.chunks.clear();
        this.loadingChunks.clear();
        this.video.removeEventListener('timeupdate', this.updateBufferState);
        this.video.removeEventListener('seeking', this.handleSeeking);
        this.video.removeEventListener('progress', this.handleProgress);
    }
}

// Create and export factory function
export function createBufferManager(videoElement) {
    return new BufferManager(videoElement);
}
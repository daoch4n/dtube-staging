import eventEmitter from './utils/EventEmitter.js';
import { VIDEO } from './config/config.js';

/**
 * Manages video sources and caching
 */
class VideoSourceManager {
    constructor() {
        this.validCids = new Map();
        this.loadCachedCids();
        this.preloadValidCids(VIDEO.PRELOADED_CIDS);
    }

    /**
     * Load cached CIDs from localStorage
     */
    loadCachedCids() {
        try {
            const cached = localStorage.getItem(VIDEO.CID_VALID_CACHE_KEY);
            if (cached) {
                const { cids, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < VIDEO.CID_VALIDITY_DURATION) {
                    cids.forEach(({ cid, metadata }) => {
                        this.validCids.set(cid, metadata);
                    });
                }
            }
        } catch (error) {
            console.warn('Failed to load cached CIDs:', error);
        }
    }

    /**
     * Save valid CIDs to localStorage
     */
    saveCachedCids() {
        try {
            const cids = Array.from(this.validCids.entries()).map(([cid, metadata]) => ({
                cid,
                metadata
            }));

            localStorage.setItem(VIDEO.CID_VALID_CACHE_KEY, JSON.stringify({
                cids,
                timestamp: Date.now()
            }));
        } catch (error) {
            console.warn('Failed to save CID cache:', error);
        }
    }

    /**
     * Validate a video CID
     * @param {string} cid - Content ID to validate
     * @returns {Promise<boolean>} - Whether the CID is valid
     */
    async validateCid(cid) {
        // Check cache first
        if (this.validCids.has(cid)) {
            return true;
        }

        try {
            const metadata = await this.fetchMetadata(cid);
            if (this.isValidVideoMetadata(metadata)) {
                this.validCids.set(cid, metadata);
                this.saveCachedCids();
                return true;
            }
        } catch (error) {
            console.warn('CID validation failed:', error);
        }

        return false;
    }

    /**
     * Fetch metadata for a CID
     * @param {string} cid - Content ID
     * @returns {Promise<Object>} - Video metadata
     */
    async fetchMetadata(cid) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), VIDEO.LOAD_TIMEOUT);

        try {
            const response = await fetch(`https://ipfs.io/api/v0/dag/get?arg=${cid}`, {
                signal: controller.signal
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Metadata request timed out');
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * Check if metadata indicates valid video content
     * @param {Object} metadata - Video metadata
     * @returns {boolean} - Whether metadata is valid
     */
    isValidVideoMetadata(metadata) {
        // Check for required fields
        if (!metadata || typeof metadata !== 'object') {
            return false;
        }

        // Must have either Links or Data
        if (!metadata.Links && !metadata.Data) {
            return false;
        }

        // If has Links, must contain video file
        if (metadata.Links) {
            const hasVideoFile = metadata.Links.some(link =>
                link.Name.match(/\.(mp4|webm|mov)$/i) &&
                link.Size > 0
            );
            if (!hasVideoFile) {
                return false;
            }
        }

        // If has Data, must be video content type
        if (metadata.Data) {
            const isVideo = metadata.Data.some(chunk =>
                chunk.type?.startsWith('video/') ||
                chunk.contentType?.startsWith('video/')
            );
            if (!isVideo) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get metadata for a valid CID
     * @param {string} cid - Content ID
     * @returns {Object|null} - Video metadata or null if not found
     */
    getMetadata(cid) {
        return this.validCids.get(cid) || null;
    }

    /**
     * Clear expired CIDs from cache
     */
    clearExpiredCids() {
        const now = Date.now();
        let hasExpired = false;

        for (const [cid, metadata] of this.validCids.entries()) {
            if (metadata.timestamp && (now - metadata.timestamp > VIDEO.CID_VALIDITY_DURATION)) {
                this.validCids.delete(cid);
                hasExpired = true;
            }
        }

        if (hasExpired) {
            this.saveCachedCids();
        }
    }

    /**
     * Get list of valid CIDs
     * @returns {string[]} - Array of valid CIDs
     */
    getValidCids() {
        this.clearExpiredCids();
        return Array.from(this.validCids.keys());
    }

    preloadValidCids(cids) {
        cids.forEach(cid => {
            if (!this.validCids.has(cid)) {
                this.validCids.set(cid, {
                    preloaded: true,
                    timestamp: Date.now()
                });
            }
        });
        this.saveCachedCids();
    }
}

// Create and export singleton instance
const videoSourceManager = new VideoSourceManager();
export default videoSourceManager;

// Register cleanup on page unload
window.addEventListener('unload', () => {
    videoSourceManager.saveCachedCids();
});
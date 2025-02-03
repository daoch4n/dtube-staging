/**
 * Video player configuration settings
 */

export const VIDEO_SETTINGS = {
    // Playback settings
    DEFAULT_VOLUME: 1.0,
    DEFAULT_PLAYBACK_RATE: 1.0,
    SEEK_STEP: 10, // seconds
    VOLUME_STEP: 0.1,
    MIN_VOLUME: 0,
    MAX_VOLUME: 1,

    // Buffer settings
    MINIMUM_BUFFER: 2, // seconds
    OPTIMAL_BUFFER: 10, // seconds
    MAX_BUFFER_SIZE: 50 * 1024 * 1024, // 50MB
    BUFFER_CHECK_INTERVAL: 1000, // ms
    BUFFER_STALL_TIMEOUT: 5000, // ms before triggering stall event

    // Provider settings
    MAX_PROVIDER_RETRIES: 3,
    PROVIDER_TIMEOUT: 10000, // ms
    MIN_PROVIDER_SCORE: 0.1,
    PROVIDER_SCORE_DECAY: 0.95,

    // Frame analysis settings
    FRAME_ANALYSIS: {
        TARGET_FPS: 30,
        MIN_FRAME_INTERVAL: 1000 / 30, // ms
        SAMPLE_SIZE: {
            WIDTH: 32,
            HEIGHT: 32
        },
        COLOR_ANALYSIS: {
            MIN_BRIGHTNESS: 0.1,
            MAX_BRIGHTNESS: 0.9,
            SATURATION_THRESHOLD: 0.1,
            TEMPORAL_SMOOTHING: 0.8
        }
    },

    // Cache settings
    CACHE: {
        MAX_AGE: 24 * 60 * 60 * 1000, // 24 hours
        MAX_ITEMS: 100,
        CLEANUP_INTERVAL: 60 * 60 * 1000 // 1 hour
    },

    // Error handling
    ERROR_HANDLING: {
        MAX_RETRIES: 3,
        RETRY_DELAY: 1000, // ms
        FATAL_ERROR_CODES: [
            MediaError.MEDIA_ERR_ABORTED,
            MediaError.MEDIA_ERR_NETWORK,
            MediaError.MEDIA_ERR_DECODE,
            MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
        ]
    },

    // Media source settings
    MSE: {
        SEGMENT_DURATION: 2, // seconds
        BUFFER_SIZE: 30, // seconds
        MIME_TYPES: {
            MP4: 'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
            WEBM: 'video/webm; codecs="vp8,vorbis"'
        }
    },

    // Network settings
    NETWORK: {
        CHUNK_SIZE: 1024 * 1024, // 1MB
        CONCURRENT_CHUNKS: 3,
        BANDWIDTH_ESTIMATION_TIME: 5000, // ms
        MIN_BANDWIDTH: 500 * 1024, // 500kbps
        LOW_BANDWIDTH_THRESHOLD: 1.5 * 1024 * 1024 // 1.5Mbps
    },

    // Quality settings
    QUALITY: {
        AUTO_QUALITY_INTERVAL: 5000, // ms
        BUFFER_THRESHOLD_LOW: 5, // seconds
        BUFFER_THRESHOLD_HIGH: 15, // seconds
        QUALITY_LEVELS: [
            { bitrate: 400000, height: 360 },
            { bitrate: 800000, height: 480 },
            { bitrate: 1500000, height: 720 },
            { bitrate: 3000000, height: 1080 }
        ]
    },

    // Analytics settings
    ANALYTICS: {
        SAMPLE_INTERVAL: 1000, // ms
        METRICS: {
            BUFFER_OCCUPANCY: true,
            PLAYBACK_QUALITY: true,
            FRAME_DROPS: true,
            ERROR_RATE: true,
            BANDWIDTH_USAGE: true
        }
    }
};

/**
 * Supported video formats
 */
export const SUPPORTED_FORMATS = [
    {
        extension: 'mp4',
        mimeType: 'video/mp4',
        codecs: ['avc1.42E01E', 'mp4a.40.2']
    },
    {
        extension: 'webm',
        mimeType: 'video/webm',
        codecs: ['vp8', 'vorbis']
    },
    {
        extension: 'mov',
        mimeType: 'video/quicktime'
    }
];

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
    NETWORK_ERROR: 'Network error occurred while loading the video',
    DECODE_ERROR: 'Error occurred while decoding the video',
    NOT_SUPPORTED: 'Video format is not supported',
    ABORTED: 'Video loading was aborted',
    PROVIDER_ERROR: 'Error occurred while fetching from provider',
    BUFFER_STALL: 'Video playback stalled due to insufficient buffer',
    UNKNOWN_ERROR: 'An unknown error occurred'
};

/**
 * User interface text
 */
export const UI_TEXT = {
    PLAY: 'Play',
    PAUSE: 'Pause',
    MUTE: 'Mute',
    UNMUTE: 'Unmute',
    FULLSCREEN: 'Enter fullscreen',
    EXIT_FULLSCREEN: 'Exit fullscreen',
    SETTINGS: 'Settings',
    QUALITY: 'Quality',
    AUTO: 'Auto'
};

// Export all configurations
export default {
    VIDEO_SETTINGS,
    SUPPORTED_FORMATS,
    ERROR_MESSAGES,
    UI_TEXT
};
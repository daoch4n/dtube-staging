/**
 * Web Worker for video frame analysis
 * Handles pixel data processing and quality recommendations off the main thread
 */

// Configuration
const config = {
    SAMPLE_STEP: 4,         // Number of pixels to skip in sampling
    MIN_BRIGHTNESS: 0.1,    // Minimum brightness threshold
    MAX_BRIGHTNESS: 0.9,    // Maximum brightness threshold
    WEIGHT_DECAY: 0.8,      // Weight decay factor for temporal smoothing
    MOTION_THRESHOLD: 0.2,  // Motion detection threshold
    COMPLEXITY_WEIGHTS: {
        detail: 0.4,
        motion: 0.3,
        contrast: 0.3
    }
};

// State for temporal analysis
let prevFrame = null;
let prevHue = 0;
let prevSaturation = 0;
let prevLightness = 0;
let frameCount = 0;
let lastProcessingTime = 0;

/**
 * Convert RGB to HSL color space
 * @param {number} r - Red component (0-255)
 * @param {number} g - Green component (0-255)
 * @param {number} b - Blue component (0-255)
 * @returns {number[]} - [hue, saturation, lightness]
 */
function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }

        h /= 6;
    }

    return [
        h * 360,           // Hue in degrees
        s * 100,           // Saturation in percent
        l * 100            // Lightness in percent
    ];
}

/**
 * Calculate frame complexity metrics
 * @param {Uint8ClampedArray} data - Current frame data
 * @param {Uint8ClampedArray} prevData - Previous frame data
 * @param {number} width - Frame width
 * @param {number} height - Frame height
 * @returns {Object} - Complexity metrics
 */
function calculateComplexity(data, prevData, width, height) {
    let detail = 0;
    let motion = 0;
    let contrast = 0;
    let edgeCount = 0;

    // Calculate metrics using sampled pixels
    for (let y = config.SAMPLE_STEP; y < height - config.SAMPLE_STEP; y += config.SAMPLE_STEP) {
        for (let x = config.SAMPLE_STEP; x < width - config.SAMPLE_STEP; x += config.SAMPLE_STEP) {
            const i = (y * width + x) * 4;

            // Detail - measure local variation
            const neighbors = [
                i - width * 4,  // top
                i + width * 4,  // bottom
                i - 4,          // left
                i + 4           // right
            ];

            let localVariation = 0;
            for (const n of neighbors) {
                localVariation += Math.abs(data[i] - data[n]) +
                                Math.abs(data[i + 1] - data[n + 1]) +
                                Math.abs(data[i + 2] - data[n + 2]);
            }
            detail += localVariation / (3 * 4);  // Average over channels and neighbors

            // Motion - compare with previous frame
            if (prevData) {
                const pixelDiff = Math.abs(data[i] - prevData[i]) +
                                Math.abs(data[i + 1] - prevData[i + 1]) +
                                Math.abs(data[i + 2] - prevData[i + 2]);
                motion += pixelDiff / 3;
            }

            // Contrast - measure local luminance variation
            const [, , l1] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
            const [, , l2] = rgbToHsl(data[i + 4], data[i + 5], data[i + 6]);
            contrast += Math.abs(l1 - l2);

            // Edge detection
            if (localVariation > 100) {  // Simple threshold-based edge detection
                edgeCount++;
            }
        }
    }

    // Normalize metrics
    const totalPixels = (width * height) / (config.SAMPLE_STEP * config.SAMPLE_STEP);
    detail = detail / totalPixels;
    motion = motion / totalPixels;
    contrast = contrast / totalPixels;
    const edgeDensity = edgeCount / totalPixels;

    return {
        detail: Math.min(detail / 255, 1),
        motion: Math.min(motion / 255, 1),
        contrast: Math.min(contrast / 100, 1),
        edgeDensity: edgeDensity
    };
}

/**
 * Analyze pixel data for colors and complexity
 * @param {Uint8ClampedArray} data - Pixel data array
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Object} - Analysis results
 */
function analyzePixelData(data, width, height) {
    const startTime = performance.now();
    let totalWeight = 0;
    let weightedHue = 0;
    let weightedSaturation = 0;
    let weightedLightness = 0;

    // Color analysis
    for (let y = 0; y < height; y += config.SAMPLE_STEP) {
        for (let x = 0; x < width; x += config.SAMPLE_STEP) {
            const i = (y * width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3] / 255;

            if (a < 0.5) continue;

            const [h, s, l] = rgbToHsl(r, g, b);

            if (l/100 < config.MIN_BRIGHTNESS || l/100 > config.MAX_BRIGHTNESS) {
                continue;
            }

            const weight = (s/100) * a;

            if (weight > 0.1) {
                totalWeight += weight;
                weightedHue += h * weight;
                weightedSaturation += s * weight;
                weightedLightness += l * weight;
            }
        }
    }

    // Calculate weighted averages
    let hue = totalWeight > 0 ? weightedHue / totalWeight : 0;
    let saturation = totalWeight > 0 ? weightedSaturation / totalWeight : 0;
    let lightness = totalWeight > 0 ? weightedLightness / totalWeight : 50;

    // Apply temporal smoothing
    hue = prevHue * config.WEIGHT_DECAY + hue * (1 - config.WEIGHT_DECAY);
    saturation = prevSaturation * config.WEIGHT_DECAY + saturation * (1 - config.WEIGHT_DECAY);
    lightness = prevLightness * config.WEIGHT_DECAY + lightness * (1 - config.WEIGHT_DECAY);

    // Update previous values
    prevHue = hue;
    prevSaturation = saturation;
    prevLightness = lightness;

    // Calculate complexity metrics
    const complexity = calculateComplexity(data, prevFrame, width, height);
    
    // Calculate processing performance
    const processingTime = performance.now() - startTime;
    const frameRate = 1000 / (processingTime - lastProcessingTime);
    lastProcessingTime = processingTime;

    // Store current frame for motion detection
    prevFrame = new Uint8ClampedArray(data);
    frameCount++;

    // Calculate overall complexity score
    const complexityScore = 
        complexity.detail * config.COMPLEXITY_WEIGHTS.detail +
        complexity.motion * config.COMPLEXITY_WEIGHTS.motion +
        complexity.contrast * config.COMPLEXITY_WEIGHTS.contrast;

    return {
        colors: {
            hue: Math.round(hue),
            saturation: Math.round(saturation),
            lightness: Math.round(lightness)
        },
        metrics: {
            complexity: complexityScore,
            detail: complexity.detail,
            motion: complexity.motion,
            contrast: complexity.contrast,
            edgeDensity: complexity.edgeDensity,
            processingTime,
            frameRate: Math.round(frameRate)
        },
        confidence: totalWeight > 0 ? 
            Math.min(totalWeight / (width * height / (config.SAMPLE_STEP * config.SAMPLE_STEP)), 1) : 0
    };
}

/**
 * Calculate recommended quality based on analysis
 * @param {Object} analysis - Frame analysis results
 * @returns {Object} - Quality recommendation
 */
function calculateQualityRecommendation(analysis) {
    const { metrics, confidence } = analysis;
    
    // Base quality score on complexity and processing performance
    const qualityScore = Math.min(
        1,
        (1 - metrics.complexity) * 0.6 +  // Lower complexity allows higher quality
        (metrics.frameRate / 60) * 0.2 +  // Higher frame rate allows higher quality
        (1 - metrics.motion) * 0.2        // Less motion allows higher quality
    );

    // Determine recommended resolution and bitrate
    let recommendation;
    if (qualityScore > 0.8) {
        recommendation = { height: 1080, bitrate: 3000000 };  // 1080p
    } else if (qualityScore > 0.6) {
        recommendation = { height: 720, bitrate: 1500000 };   // 720p
    } else if (qualityScore > 0.4) {
        recommendation = { height: 480, bitrate: 800000 };    // 480p
    } else {
        recommendation = { height: 360, bitrate: 400000 };    // 360p
    }

    return {
        ...recommendation,
        score: qualityScore,
        confidence: confidence
    };
}

/**
 * Handle messages from main thread
 */
self.onmessage = function(e) {
    const { data, width, height, timestamp } = e.data;

    try {
        const analysis = analyzePixelData(data, width, height);
        const qualityRecommendation = calculateQualityRecommendation(analysis);

        self.postMessage({
            analysis,
            quality: qualityRecommendation,
            timestamp
        });
    } catch (error) {
        self.postMessage({
            error: error.message,
            timestamp
        });
    }
};

/**
 * Handle worker errors
 */
self.onerror = function(error) {
    self.postMessage({
        error: error.message,
        timestamp: Date.now()
    });
};
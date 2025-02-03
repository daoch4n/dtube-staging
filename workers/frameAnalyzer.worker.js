/**
 * Web Worker for video frame analysis
 * Handles pixel data processing off the main thread
 */

// Configuration
const config = {
    SAMPLE_STEP: 4,         // Number of pixels to skip in sampling
    MIN_BRIGHTNESS: 0.1,    // Minimum brightness threshold
    MAX_BRIGHTNESS: 0.9,    // Maximum brightness threshold
    WEIGHT_DECAY: 0.8       // Weight decay factor for temporal smoothing
};

// State for temporal analysis
let prevHue = 0;
let prevSaturation = 0;
let prevLightness = 0;

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
 * Analyze pixel data for dominant colors
 * @param {Uint8ClampedArray} data - Pixel data array
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Object} - Analysis results
 */
function analyzePixelData(data, width, height) {
    let totalWeight = 0;
    let weightedHue = 0;
    let weightedSaturation = 0;
    let weightedLightness = 0;

    // Sample pixels with specified step
    for (let y = 0; y < height; y += config.SAMPLE_STEP) {
        for (let x = 0; x < width; x += config.SAMPLE_STEP) {
            const i = (y * width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3] / 255;

            // Skip transparent pixels
            if (a < 0.5) continue;

            // Convert to HSL
            const [h, s, l] = rgbToHsl(r, g, b);

            // Skip very dark or very bright pixels
            if (l/100 < config.MIN_BRIGHTNESS || l/100 > config.MAX_BRIGHTNESS) {
                continue;
            }

            // Weight by saturation and alpha
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

    return {
        hue: Math.round(hue),
        saturation: Math.round(saturation),
        lightness: Math.round(lightness),
        confidence: totalWeight > 0 ? Math.min(totalWeight / (width * height / (config.SAMPLE_STEP * config.SAMPLE_STEP)), 1) : 0
    };
}

/**
 * Handle messages from main thread
 */
self.onmessage = function(e) {
    const { data, width, height, timestamp } = e.data;

    try {
        const result = analyzePixelData(data, width, height);
        self.postMessage({
            ...result,
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
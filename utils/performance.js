/**
 * Performance optimization utilities for video player
 */

/**
 * Creates a throttled version of a function that only invokes the
 * function at most once per every `wait` milliseconds.
 *
 * @param {Function} func - Function to throttle
 * @param {number} wait - Throttle wait time in milliseconds
 * @param {Object} options - Configuration options
 * @returns {Function} - Throttled function
 */
export function throttle(func, wait, options = {}) {
  let timeout = null;
  let previous = 0;

  return function throttled(...args) {
    const now = Date.now();

    if (!previous && options.leading === false) {
      previous = now;
    }

    const remaining = wait - (now - previous);

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      func.apply(this, args);
    } else if (!timeout && options.trailing !== false) {
      timeout = setTimeout(() => {
        previous = options.leading === false ? 0 : Date.now();
        timeout = null;
        func.apply(this, args);
      }, remaining);
    }
  };
}

/**
 * Creates a debounced version of a function that delays invoking
 * the function until after `wait` milliseconds have elapsed since
 * the last time it was invoked.
 *
 * @param {Function} func - Function to debounce
 * @param {number} wait - Debounce wait time in milliseconds
 * @param {Object} options - Configuration options
 * @returns {Function} - Debounced function
 */
export function debounce(func, wait, options = {}) {
  let timeout = null;
  let previous = 0;

  return function debounced(...args) {
    const later = () => {
      timeout = null;
      if (!options.leading) {
        func.apply(this, args);
      }
    };

    const now = Date.now();
    if (!previous && options.leading) {
      previous = now;
    }

    const remaining = wait - (now - previous);

    if (timeout) {
      clearTimeout(timeout);
    }

    if (!previous && options.leading) {
      previous = now;
      func.apply(this, args);
    } else {
      timeout = setTimeout(later, remaining);
    }
  };
}

/**
 * Utility class for frame rate limiting and timing
 */
export class FrameRateLimiter {
  constructor(targetFPS = 30) {
    this.targetFPS = targetFPS;
    this.frameInterval = 1000 / targetFPS;
    this.lastFrameTime = 0;
  }

  /**
   * Check if enough time has passed for the next frame
   * @returns {boolean} - Whether to process the next frame
   */
  shouldProcessFrame() {
    const now = performance.now();
    if (now - this.lastFrameTime >= this.frameInterval) {
      this.lastFrameTime = now;
      return true;
    }
    return false;
  }

  /**
   * Reset the frame timer
   */
  reset() {
    this.lastFrameTime = 0;
  }

  /**
   * Update the target FPS
   * @param {number} newFPS - New target FPS
   */
  setTargetFPS(newFPS) {
    this.targetFPS = newFPS;
    this.frameInterval = 1000 / newFPS;
  }
}

/**
 * Utility for optimized color analysis from video frames
 */
export class ColorAnalyzer {
  constructor(sampleSize = 32) {
    this.sampleSize = sampleSize;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.canvas.width = sampleSize;
    this.canvas.height = sampleSize;
  }

  /**
   * Get the dominant hue from a video frame
   * @param {HTMLVideoElement} video - Video element to analyze
   * @returns {number} - Dominant hue value (0-360)
   */
  getDominantHue(video) {
    if (!video.videoWidth || !video.videoHeight) return 0;

    try {
      this.ctx.drawImage(video, 0, 0, this.sampleSize, this.sampleSize);
      const imageData = this.ctx.getImageData(0, 0, this.sampleSize, this.sampleSize);
      return this.calculateAverageHue(imageData.data);
    } catch (error) {
      console.warn('Frame analysis error:', error);
      return 0;
    }
  }

  /**
   * Calculate the average hue from RGB data
   * @param {Uint8ClampedArray} data - Pixel data array
   * @returns {number} - Average hue value (0-360)
   */
  calculateAverageHue(data) {
    let r = 0, g = 0, b = 0;
    const step = 4; // RGBA
    const totalPixels = data.length / 4;

    for (let i = 0; i < data.length; i += step * 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }

    r /= totalPixels;
    g /= totalPixels;
    b /= totalPixels;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let hue = 0;

    if (max !== min) {
      if (max === r) {
        hue = (60 * ((g - b) / (max - min)) + 360) % 360;
      } else if (max === g) {
        hue = (60 * ((b - r) / (max - min)) + 120) % 360;
      } else {
        hue = (60 * ((r - g) / (max - min)) + 240) % 360;
      }
    }

    return hue;
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.canvas = null;
    this.ctx = null;
  }
}

/**
 * RequestAnimationFrame with automatic cancellation and error handling
 */
export class AnimationLoop {
  constructor(callback) {
    this.callback = callback;
    this.rafId = null;
    this.isRunning = false;
    this.boundTick = this.tick.bind(this);
  }

  /**
   * Start the animation loop
   */
  start() {
    if (!this.isRunning) {
      this.isRunning = true;
      this.tick();
    }
  }

  /**
   * Stop the animation loop
   */
  stop() {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Animation tick handler
   */
  tick() {
    if (!this.isRunning) return;

    try {
      this.callback();
      this.rafId = requestAnimationFrame(this.boundTick);
    } catch (error) {
      console.error('Animation loop error:', error);
      this.stop();
    }
  }
}
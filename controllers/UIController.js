import eventEmitter from '../utils/EventEmitter.js';
import { throttle, debounce } from '../utils/performance.js';
import { UI } from '../config/config.js';

/**
 * Manages video player UI state and interactions
 */
class UIController {
  constructor(containerElement) {
    this.container = containerElement;
    this.controlsVisible = true;
    this.userInteracting = false;
    this.lastInteraction = Date.now();

    // UI Elements
    this.elements = {
      controls: null,
      progress: null,
      timestamp: null,
      playButton: null,
      volumeSlider: null,
      fullscreenButton: null,
      bufferBar: null
    };

    this.initialize();
  }

  /**
   * Initialize the UI controller
   */
  initialize() {
    this.createUIElements();
    this.setupEventListeners();
    this.setupControlsTimeout();
  }

  /**
   * Create UI elements
   */
  createUIElements() {
    // Controls container
    this.elements.controls = document.createElement('div');
    this.elements.controls.className = 'video-controls';

    // Progress bar
    this.elements.progress = document.createElement('div');
    this.elements.progress.className = 'progress-bar';

    this.elements.bufferBar = document.createElement('div');
    this.elements.bufferBar.className = 'buffer-bar';
    this.elements.progress.appendChild(this.elements.bufferBar);

    // Timestamp
    this.elements.timestamp = document.createElement('div');
    this.elements.timestamp.className = 'timestamp';

    // Play button
    this.elements.playButton = document.createElement('button');
    this.elements.playButton.className = 'play-button';

    // Volume slider
    this.elements.volumeSlider = document.createElement('input');
    this.elements.volumeSlider.type = 'range';
    this.elements.volumeSlider.className = 'volume-slider';
    this.elements.volumeSlider.min = '0';
    this.elements.volumeSlider.max = '1';
    this.elements.volumeSlider.step = '0.1';

    // Fullscreen button
    this.elements.fullscreenButton = document.createElement('button');
    this.elements.fullscreenButton.className = 'fullscreen-button';

    // Append elements
    this.elements.controls.appendChild(this.elements.playButton);
    this.elements.controls.appendChild(this.elements.volumeSlider);
    this.elements.controls.appendChild(this.elements.progress);
    this.elements.controls.appendChild(this.elements.timestamp);
    this.elements.controls.appendChild(this.elements.fullscreenButton);

    this.container.appendChild(this.elements.controls);
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Mouse movement
    this.container.addEventListener('mousemove',
      throttle(this.handleMouseMove.bind(this), UI.CONTROLS_TIMEOUT / 3)
    );

    this.container.addEventListener('mouseleave',
      () => this.hideControls()
    );

    // Touch events
    let lastTap = 0;
    this.container.addEventListener('touchstart', (e) => {
      const now = Date.now();
      if (now - lastTap < UI.MULTI_TAP_DELAY) {
        this.handleDoubleTap(e);
      }
      lastTap = now;
    });

    // Progress bar
    this.elements.progress.addEventListener('mousedown',
      this.handleProgressMouseDown.bind(this)
    );

    document.addEventListener('mouseup',
      this.handleProgressMouseUp.bind(this)
    );

    document.addEventListener('mousemove',
      throttle(this.handleProgressMouseMove.bind(this), UI.THROTTLE.PROGRESS)
    );

    // Playback controls
    this.elements.playButton.addEventListener('click',
      this.handlePlayClick.bind(this)
    );

    this.elements.volumeSlider.addEventListener('input',
      debounce(this.handleVolumeChange.bind(this), 100)
    );

    this.elements.fullscreenButton.addEventListener('click',
      this.handleFullscreenClick.bind(this)
    );

    // Video events
    eventEmitter.on('video:timeupdate', this.updateProgress.bind(this));
    eventEmitter.on('video:buffer-update', this.updateBuffer.bind(this));
    eventEmitter.on('video:play', () => this.updatePlayButton(true));
    eventEmitter.on('video:pause', () => this.updatePlayButton(false));
  }

  /**
   * Set up controls auto-hide timeout
   */
  setupControlsTimeout() {
    this.controlsTimeout = debounce(() => {
      if (!this.userInteracting) {
        this.hideControls();
      }
    }, UI.CONTROLS_TIMEOUT);
  }

  /**
   * Handle mouse movement
   * @param {MouseEvent} event - Mouse event
   */
  handleMouseMove(event) {
    this.lastInteraction = Date.now();
    this.showControls();
    this.controlsTimeout();
  }

  /**
   * Handle progress bar mouse down
   * @param {MouseEvent} event - Mouse event
   */
  handleProgressMouseDown(event) {
    this.userInteracting = true;
    this.updateProgressFromMouse(event);
  }

  /**
   * Handle progress bar mouse up
   */
  handleProgressMouseUp() {
    this.userInteracting = false;
    this.controlsTimeout();
  }

  /**
   * Handle progress bar mouse move
   * @param {MouseEvent} event - Mouse event
   */
  handleProgressMouseMove(event) {
    if (this.userInteracting) {
      this.updateProgressFromMouse(event);
    }
  }

  /**
   * Handle double tap
   * @param {TouchEvent} event - Touch event
   */
  handleDoubleTap(event) {
    event.preventDefault();
    const x = event.touches[0].clientX;
    const width = this.container.offsetWidth;

    if (x < width / 2) {
      eventEmitter.emit('video:seek-backward');
    } else {
      eventEmitter.emit('video:seek-forward');
    }
  }

  /**
   * Handle play button click
   */
  handlePlayClick() {
    eventEmitter.emit('video:toggle-play');
  }

  /**
   * Handle volume change
   * @param {Event} event - Input event
   */
  handleVolumeChange(event) {
    eventEmitter.emit('video:volume-change', parseFloat(event.target.value));
  }

  /**
   * Handle fullscreen button click
   */
  handleFullscreenClick() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      this.container.requestFullscreen();
    }
  }

  /**
   * Update progress from mouse position
   * @param {MouseEvent} event - Mouse event
   */
  updateProgressFromMouse(event) {
    const rect = this.elements.progress.getBoundingClientRect();
    const percent = Math.min(Math.max(0, (event.clientX - rect.left) / rect.width), 1);
    eventEmitter.emit('video:seek-percent', percent);
  }

  /**
   * Update progress bar
   * @param {Object} data - Progress data
   */
  updateProgress({ currentTime, duration }) {
    if (!this.userInteracting && this.elements.progress) {
      const percent = (currentTime / duration) * 100;
      this.elements.progress.style.setProperty('--progress', `${percent}%`);
      this.updateTimestamp(currentTime, duration);
    }
  }

  /**
   * Update buffer bar
   * @param {Object} data - Buffer data
   */
  updateBuffer({ buffered, duration }) {
    if (this.elements.bufferBar) {
      const percent = (buffered / duration) * 100;
      this.elements.bufferBar.style.width = `${percent}%`;
    }
  }

  /**
   * Update timestamp display
   * @param {number} currentTime - Current time in seconds
   * @param {number} duration - Duration in seconds
   */
  updateTimestamp(currentTime, duration) {
    if (this.elements.timestamp) {
      const current = this.formatTime(currentTime);
      const total = this.formatTime(duration);
      this.elements.timestamp.textContent = `${current} / ${total}`;
    }
  }

  /**
   * Update play button state
   * @param {boolean} playing - Whether video is playing
   */
  updatePlayButton(playing) {
    if (this.elements.playButton) {
      this.elements.playButton.classList.toggle('playing', playing);
      this.elements.playButton.setAttribute('aria-label',
        playing ? 'Pause' : 'Play'
      );
    }
  }

  /**
   * Show controls
   */
  showControls() {
    if (!this.controlsVisible) {
      this.controlsVisible = true;
      this.elements.controls.classList.remove('hidden');
    }
  }

  /**
   * Hide controls
   */
  hideControls() {
    if (this.controlsVisible && !this.userInteracting) {
      this.controlsVisible = false;
      this.elements.controls.classList.add('hidden');
    }
  }

  /**
   * Format time in seconds to MM:SS
   * @param {number} seconds - Time in seconds
   * @returns {string} - Formatted time
   */
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.container.innerHTML = '';
    this.elements = {};
  }
}

export default UIController;
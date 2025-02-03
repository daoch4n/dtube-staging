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
    this.state = {
      isDragging: false,
      isDraggingPopup: false,
      cachedRect: null
    };

    // UI Elements
    this.elements = {
      controls: null,
      progressContainer: null,
      progress: null,
      timestamp: null,
      timestampPopup: null,
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

    // Progress container
    this.elements.progressContainer = document.createElement('div');
    this.elements.progressContainer.className = 'progress-container';

    // Progress bar
    this.elements.progress = document.createElement('div');
    this.elements.progress.className = 'progress-bar';

    this.elements.bufferBar = document.createElement('div');
    this.elements.bufferBar.className = 'buffer-bar';
    this.elements.progress.appendChild(this.elements.bufferBar);

    // Timestamp popup
    this.elements.timestampPopup = document.createElement('div');
    this.elements.timestampPopup.className = 'timestamp-popup';
    this.elements.timestampPopup.style.display = 'none';

    // Regular timestamp
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
    this.elements.progressContainer.appendChild(this.elements.progress);
    this.elements.progressContainer.appendChild(this.elements.timestampPopup);

    this.elements.controls.appendChild(this.elements.playButton);
    this.elements.controls.appendChild(this.elements.volumeSlider);
    this.elements.controls.appendChild(this.elements.progressContainer);
    this.elements.controls.appendChild(this.elements.timestamp);
    this.elements.controls.appendChild(this.elements.fullscreenButton);

    this.container.appendChild(this.elements.controls);
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Use unified pointer events
    const wrapper = document.querySelector('.video-wrapper');
    const handler = this.handleUnifiedPointerEvent.bind(this);
    
    // Use passive: false for pointerdown to allow preventDefault
    wrapper.addEventListener('pointerdown', handler, { passive: false });
    wrapper.addEventListener('pointermove', throttle(handler, 32), { passive: true });
    wrapper.addEventListener('pointerup', handler, { passive: true });
    wrapper.addEventListener('pointercancel', handler, { passive: true });

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

    // Video events
    eventEmitter.on('video:timeupdate', this.updateProgress.bind(this));
    eventEmitter.on('video:buffer-update', this.updateBuffer.bind(this));
    eventEmitter.on('video:play', () => this.updatePlayButton(true));
    eventEmitter.on('video:pause', () => this.updatePlayButton(false));
    eventEmitter.on('video:seeking', () => this.handleBufferingStart(true));
    eventEmitter.on('video:seeked', () => this.handleBufferingEnd());
  }

  /**
   * Handle unified pointer events
   * @param {PointerEvent} e - Pointer event
   */
  handleUnifiedPointerEvent(e) {
    switch (e.type) {
      case 'pointerdown':
        this.handlePointerDown(e);
        break;
      case 'pointermove':
        this.handlePointerMove(e);
        break;
      case 'pointerup':
      case 'pointercancel':
        this.handlePointerUp(e);
        break;
    }
  }

  /**
   * Handle pointer down
   * @param {PointerEvent} e - Pointer event
   */
  handlePointerDown(e) {
    e.preventDefault();
    this.state.isDragging = true;
    this.showControls();
    this.elements.progressContainer.setPointerCapture(e.pointerId);
    this.seek(e.clientX);
    this.elements.timestampPopup.style.display = 'block';
    this.elements.progress.classList.add('dragging');
    this.updateTimestampPopupPreview(this.calculateSeekPosition(e.clientX).offsetX);
  }

  /**
   * Handle pointer move
   * @param {PointerEvent} e - Pointer event
   */
  handlePointerMove(e) {
    if (this.state.isDragging) {
      this.seek(e.clientX);
      this.updateTimestampPopupPreview(this.calculateSeekPosition(e.clientX).offsetX);
    }
  }

  /**
   * Handle pointer up
   * @param {PointerEvent} e - Pointer event
   */
  handlePointerUp(e) {
    if (this.state.isDragging) {
      this.seek(e.clientX);
      this.state.isDragging = false;
      this.elements.progressContainer.classList.remove('dragging', 'active', 'near');
      this.hideTimestampPopup();
      this.elements.progress.classList.remove('dragging');
    }
  }

  /**
   * Set up controls auto-hide timeout
   */
  setupControlsTimeout() {
    this.controlsTimeout = debounce(() => {
      if (!this.userInteracting && !this.state.isDragging) {
        this.hideControls();
      }
    }, UI.CONTROLS_TIMEOUT);
  }

  /**
   * Calculate seek position from mouse x coordinate
   * @param {number} clientX - Mouse X coordinate
   * @returns {Object} Position data
   */
  calculateSeekPosition(clientX) {
    if (!this.state.cachedRect) {
      this.state.cachedRect = this.elements.progressContainer.getBoundingClientRect();
    }
    const rect = this.state.cachedRect;
    const offsetX = Math.min(Math.max(0, clientX - rect.left), rect.width);
    const time = (offsetX / rect.width) * this.video.duration;
    return { offsetX, time };
  }

  /**
   * Update timestamp popup preview
   * @param {number} offsetX - Offset from left edge
   */
  updateTimestampPopupPreview(offsetX) {
    if (this.elements.timestampPopup) {
      this.elements.timestampPopup.style.left = `${offsetX}px`;
      this.elements.timestampPopup.textContent = this.formatTime(
        (offsetX / this.elements.progressContainer.offsetWidth) * this.video.duration
      );
    }
  }

  /**
   * Hide timestamp popup
   */
  hideTimestampPopup() {
    if (this.elements.timestampPopup) {
      this.elements.timestampPopup.style.display = 'none';
    }
  }

  /**
   * Handle buffering start
   * @param {boolean} isSeeking - Whether buffering is due to seeking
   */
  handleBufferingStart(isSeeking = false) {
    this.elements.progressContainer.classList.add('buffering');
    if (isSeeking) {
      this.elements.progressContainer.classList.add('seeking');
    }
  }

  /**
   * Handle buffering end
   */
  handleBufferingEnd() {
    this.elements.progressContainer.classList.remove('buffering', 'seeking');
  }

  /**
   * Seek to position
   * @param {number} clientX - Mouse X coordinate
   */
  seek(clientX) {
    const position = this.calculateSeekPosition(clientX);
    eventEmitter.emit('video:seek-percent', position.time / this.video.duration);
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
   * Update progress bar
   * @param {Object} data - Progress data
   */
  updateProgress({ currentTime, duration }) {
    if (!this.state.isDragging && this.elements.progress) {
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
    if (this.controlsVisible && !this.userInteracting && !this.state.isDragging) {
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
/**
 * A robust event emitter implementation for handling application-wide events
 */
class EventEmitter {
  constructor() {
    this.events = new Map();
    this.maxListeners = 10;
    this.warnOnMaxListeners = true;
  }

  /**
   * Add an event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event handler
   * @param {Object} options - Additional options (once, priority)
   * @returns {Function} - Unsubscribe function
   */
  on(event, listener, options = {}) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }

    const listeners = this.events.get(event);
    const wrapped = {
      fn: listener,
      once: options.once || false,
      priority: options.priority || 0
    };

    if (this.warnOnMaxListeners && listeners.size >= this.maxListeners) {
      console.warn(`Warning: Event '${event}' has exceeded ${this.maxListeners} listeners`);
    }

    listeners.add(wrapped);

    // Return unsubscribe function
    return () => {
      listeners.delete(wrapped);
      if (listeners.size === 0) {
        this.events.delete(event);
      }
    };
  }

  /**
   * Add a one-time event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event handler
   * @param {Object} options - Additional options (priority)
   * @returns {Function} - Unsubscribe function
   */
  once(event, listener, options = {}) {
    return this.on(event, listener, { ...options, once: true });
  }

  /**
   * Remove an event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event handler to remove
   */
  off(event, listener) {
    if (!this.events.has(event)) return;

    const listeners = this.events.get(event);
    for (const wrapped of listeners) {
      if (wrapped.fn === listener) {
        listeners.delete(wrapped);
        break;
      }
    }

    if (listeners.size === 0) {
      this.events.delete(event);
    }
  }

  /**
   * Remove all listeners for an event
   * @param {string} event - Event name (optional, if omitted removes all events)
   */
  removeAllListeners(event) {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }

  /**
   * Get list of listeners for an event
   * @param {string} event - Event name
   * @returns {Function[]} Array of listener functions
   */
  listeners(event) {
    if (!this.events.has(event)) return [];
    return Array.from(this.events.get(event))
      .sort((a, b) => b.priority - a.priority)
      .map(wrapped => wrapped.fn);
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {...any} args - Arguments to pass to listeners
   * @returns {boolean} - true if event had listeners, false otherwise
   */
  emit(event, ...args) {
    if (!this.events.has(event)) return false;

    const listeners = this.events.get(event);
    const toRemove = new Set();

    // Sort by priority and execute
    Array.from(listeners)
      .sort((a, b) => b.priority - a.priority)
      .forEach(wrapped => {
        try {
          wrapped.fn.apply(this, args);
          if (wrapped.once) {
            toRemove.add(wrapped);
          }
        } catch (error) {
          console.error(`Error in event listener for '${event}':`, error);
          if (wrapped.once) {
            toRemove.add(wrapped);
          }
        }
      });

    // Clean up 'once' listeners
    toRemove.forEach(wrapped => {
      listeners.delete(wrapped);
    });

    if (listeners.size === 0) {
      this.events.delete(event);
    }

    return true;
  }

  /**
   * Set max listeners before warning
   * @param {number} n - Maximum number of listeners per event
   */
  setMaxListeners(n) {
    this.maxListeners = n;
  }

  /**
   * Enable/disable max listeners warning
   * @param {boolean} enabled - Whether to warn on max listeners
   */
  setWarnOnMaxListeners(enabled) {
    this.warnOnMaxListeners = enabled;
  }
}

// Create and export singleton instance
const eventEmitter = new EventEmitter();
export default eventEmitter;

// Export class for inheritance/extension
export { EventEmitter };
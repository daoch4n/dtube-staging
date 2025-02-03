// Core configuration settings

export const PROVIDERS = {
  list: ['ipfs.io', 'algonode.xyz', 'eth.aragon.network', 'dweb.link', 'flk-ipfs.xyz'],
  displayNames: {
    'ipfs.io': 'IPFS Gateway',
    'algonode.xyz': 'Algonode',
    'eth.aragon.network': 'Aragon',
    'dweb.link': 'IPFS',
    'flk-ipfs.xyz': 'Fleek'
  }
};

export const VIDEO = {
  CACHE_KEY: 'videoCache',
  CID_VALID_CACHE_KEY: 'validCidCache',
  CID_VALIDITY_DURATION: 48 * 60 * 60 * 1000, // 48 hours
  LOAD_TIMEOUT: 2000, // 2 seconds
  BUFFER_CHECK_DELAY: 1000 // 1 second
};

export const UI = {
  CONTROLS_TIMEOUT: 3000, // 3 seconds of inactivity
  TIMESTAMP_OFFSET_BOTTOM: 20, // px from progress bar
  POPUP_TRANSITION_DURATION: 0.05, // seconds
  MULTI_TAP_DELAY: 200, // ms between taps
  SAMPLING: {
    WIDTH: 32,
    HEIGHT: 32,
    PIXEL_STEP: 16
  }
};

export const PERFORMANCE = {
  THROTTLE: {
    PROGRESS: 66, // ~15fps
    BUFFER: 100, // 10fps
    HUE: 200 // 5fps
  },
  PRELOAD: {
    TIMEOUT: 4000 // 4 seconds
  }
};

export const ERRORS = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000 // 1 second
};
# ADR 001: Restore Core Functionality While Preserving Optimizations

## Context

The codebase has undergone significant refactoring that improved performance and code organization but inadvertently removed some critical IPFS video player functionality. We need to restore these features while maintaining recent architectural improvements.

## Core Systems Analysis

### 1. Provider Management System
#### Original Functionality (to restore)
- Multi-provider IPFS gateway support
- Smart provider selection and failover
- Provider scoring and reliability tracking
- Automatic recovery from gateway failures

#### Recent Improvements (to preserve)
- Enhanced error handling architecture
- Improved provider state management
- More efficient provider switching logic

### 2. Buffer Management
#### Original Functionality (to restore)
- Adaptive buffer size management
- Predictive buffering
- Stall detection and recovery
- Chunk-based loading with concurrent requests

#### Recent Improvements (to preserve)
- Optimized buffer monitoring
- More efficient resource cleanup
- Enhanced memory management

### 3. Quality Control System
#### Original Functionality (to restore)
- Multi-quality level support
- Bandwidth-based quality adaptation
- Buffer-based quality switching
- Smart quality selection logic

#### Recent Improvements (to preserve)
- Performance-optimized quality switches
- Enhanced quality level caching
- Improved quality selection algorithms

## Implementation Approach

### 1. Provider Management
```javascript
class VideoController {
  // Preserve new error handling
  constructor(videoElement, providers = []) {
    this.errorHandler = new ErrorHandler();
    this.sourceManager = videoSourceManager;
  }

  // Restore provider switching with new error handling
  async switchProvider(cid) {
    const provider = this.selectNextProvider(cid);
    await this.errorHandler.handleProviderSwitch(provider);
  }
}
```

### 2. Buffer Management
```javascript
// Restore buffer management with new performance optimizations
const bufferConfig = {
  minBuffer: VIDEO_SETTINGS.MINIMUM_BUFFER,
  optimalBuffer: VIDEO_SETTINGS.OPTIMAL_BUFFER,
  maxBufferSize: VIDEO_SETTINGS.MAX_BUFFER_SIZE
};
```

### 3. Quality Control
```javascript
// Preserve new frame analysis while restoring quality adaptation
const qualityManager = {
  levels: VIDEO_SETTINGS.QUALITY.QUALITY_LEVELS,
  adaptationInterval: VIDEO_SETTINGS.QUALITY.AUTO_QUALITY_INTERVAL,
  frameAnalyzer: new ColorAnalyzer(VIDEO_SETTINGS.FRAME_ANALYSIS.SAMPLE_SIZE)
};
```

## Decision

We will:
1. Reintegrate core IPFS functionality while maintaining new error handling
2. Restore buffer management while preserving memory optimizations
3. Reimplement quality control while keeping new frame analysis
4. Maintain new caching and validation systems

## Status
Proposed

## Consequences
### Positive
- Restored critical IPFS video functionality
- Preserved performance improvements
- Enhanced error handling
- Better resource management

### Negative
- Increased system complexity
- Additional validation requirements
- More complex testing needed

## Technical Details

### Key Configurations
```javascript
const VIDEO_SETTINGS = {
  BUFFER: {
    MINIMUM: 2,  // seconds
    OPTIMAL: 10, // seconds
    MAX_SIZE: 50 * 1024 * 1024 // 50MB
  },
  PROVIDER: {
    MAX_RETRIES: 3,
    TIMEOUT: 10000,
    MIN_SCORE: 0.1
  }
};
```

### Critical Patterns
1. Provider Failover
```javascript
Error Detection → State Preservation → Provider Switch →
Buffer Recovery → State Restoration → Resume Playback
```

2. Quality Adaptation
```javascript
Bandwidth Monitor → Buffer Check → Quality Decision →
Frame Analysis → Smooth Transition
```

3. Error Recovery
```javascript
Error Detection → Context Capture → Recovery Strategy →
Resource Cleanup → State Restoration
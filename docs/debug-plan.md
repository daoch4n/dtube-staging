# Video Player Debug Plan

## Current Issues

1. **Missing Buffer Recovery System**
- Buffer recovery logic from commit 8aa42e8 not present in current codebase
- No handling of buffer stalls
- Missing provider failover mechanism

2. **Broken Component Integration**
- VideoSourceManager not properly connected to VideoController
- Event system between components incomplete
- UI controls not fully integrated

3. **Missing Scroll UX Features**
- Seeking state management incomplete
- Gesture handling not implemented
- Progress bar interaction issues

## Required Changes

### app.js Updates
1. Restore buffer recovery system:
```javascript
let isSeeking = false;
let isRecovering = false;
let bufferingUpdateScheduled = false;
```

2. Add seeking state management:
```javascript
video.addEventListener('seeking', () => {
  isSeeking = true;
  if (controlsSystem) controlsSystem.handleBufferingStart(true);
});

video.addEventListener('seeked', () => {
  isSeeking = false;
  if (controlsSystem) controlsSystem.handleBufferingEnd();
});
```

3. Implement provider indices management:
```javascript
const providerIndices = new Map();
```

### VideoController Integration
1. Connect VideoSourceManager:
```javascript
constructor(videoElement, providers = []) {
  this.video = videoElement;
  this.providers = providers;
  this.sourceManager = videoSourceManager;
}
```

2. Add buffer recovery logic:
```javascript
async handleBufferRecovery() {
  if (isRecovering) return;
  isRecovering = true;
  // Recovery logic from commit
}
```

### UI Controller Updates
1. Enhance progress bar handling:
```javascript
handleProgressMouseDown(e) {
  e.preventDefault();
  this.state.isDragging = true;
  isSeeking = true;
}
```

2. Add scroll UX improvements:
```javascript
wrapper.addEventListener('pointerdown', handler, { passive: false });
wrapper.addEventListener('pointermove', throttle(handler, 32), { passive: true });
```

## Implementation Steps

1. Switch to Code mode to implement changes in app.js
2. Update VideoController with proper provider integration
3. Enhance UIController with scroll UX improvements
4. Test buffer recovery and seeking functionality
5. Verify component integration

## Testing Plan

1. **Buffer Recovery**
- Simulate network issues
- Verify provider failover
- Check buffer visualization

2. **Seeking Functionality**
- Test progress bar interaction
- Verify timestamp updates
- Check gesture controls

3. **Component Integration**
- Verify event flow
- Test state management
- Check UI updates

## Expected Result

The video player should:
1. Handle buffer stalls gracefully with recovery
2. Provide smooth seeking experience
3. Show accurate buffer/progress visualization
4. Maintain proper state during user interactions
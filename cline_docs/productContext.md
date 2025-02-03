# Product Context

## Purpose
This project is a specialized web-based video player designed to stream content from IPFS (InterPlanetary File System) with robust failover capabilities. It aims to provide a reliable and user-friendly video streaming experience while leveraging decentralized storage.

## Problems Solved
1. **IPFS Gateway Reliability**
   - Handles gateway failures through automatic provider switching
   - Implements smart provider selection with caching of reliable providers
   - Provides seamless recovery from buffering issues

2. **Video Playback Performance**
   - Optimizes buffering and preloading mechanisms
   - Implements efficient frame analysis for UI theming
   - Manages memory usage through strategic resource cleanup

3. **User Experience**
   - Offers intuitive gesture-based controls
   - Provides responsive visual feedback
   - Maintains consistent playback during network issues

## Core Functionality
- Multi-provider IPFS video streaming
- Adaptive video buffering and recovery
- Dynamic UI theming based on video content
- Gesture and keyboard-based controls
- Advanced seeking and timestamp preview
- Smart notification system
- Fullscreen support with auto-hiding controls

## Target Usage
The application is designed for:
- Streaming video content hosted on IPFS
- Supporting multiple video formats
- Operating across different devices and browsers
- Providing a YouTube-like experience for decentralized content

## Success Metrics
- Minimal playback interruptions
- Fast recovery from gateway failures
- Smooth seeking and navigation
- Responsive UI controls
- Efficient resource usage
- Cross-browser compatibility
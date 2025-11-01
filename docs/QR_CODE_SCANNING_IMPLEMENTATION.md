# QR Code Scanning Implementation - Technical Documentation

## Overview

This document describes the complete implementation of QR code scanning functionality using the `html5-qrcode` library in a React/TypeScript application. This implementation has been battle-tested and works reliably across different devices and browsers.

---

## Table of Contents

1. [Dependencies](#dependencies)
2. [Core Implementation](#core-implementation)
3. [State Management](#state-management)
4. [Lifecycle Management](#lifecycle-management)
5. [Camera Selection Logic](#camera-selection-logic)
6. [Error Handling](#error-handling)
7. [UI Integration](#ui-integration)
8. [Complete Code Example](#complete-code-example)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Dependencies

### Required Package

```bash
npm install html5-qrcode
# or
bun add html5-qrcode
```

### Import Statements

```typescript
import { Html5Qrcode } from "html5-qrcode";
```

### Additional UI Dependencies (Optional)

```typescript
import { toast } from "sonner"; // For user notifications
import { QrCode } from "lucide-react"; // For icons
```

---

## Core Implementation

### State Management

The implementation requires three key state variables:

```typescript
const [isScanning, setIsScanning] = useState(false);
const scannerRef = useRef<Html5Qrcode | null>(null);
const scannerDivRef = useRef<HTMLDivElement>(null);
```

**Explanation:**
- `isScanning`: Boolean flag to track scanning state and control UI
- `scannerRef`: Ref to store the Html5Qrcode instance for cleanup
- `scannerDivRef`: Ref to the DOM element (optional, for additional control)

---

## Lifecycle Management

### Component Cleanup (Critical!)

**ALWAYS implement cleanup to prevent memory leaks and camera access issues:**

```typescript
useEffect(() => {
  return () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
    }
  };
}, []);
```

**Why This Is Critical:**
- Releases camera resources when component unmounts
- Prevents "camera already in use" errors
- Avoids memory leaks
- The `.catch(() => {})` prevents unhandled promise rejections

---

## Camera Selection Logic

### Step-by-Step Camera Selection

```typescript
const startScanning = async () => {
  setIsScanning(true);
  
  // CRITICAL: 100ms delay to ensure DOM is ready
  setTimeout(async () => {
    try {
      // 1. Enumerate available cameras
      const cameras = await Html5Qrcode.getCameras();
      
      if (!cameras || cameras.length === 0) {
        toast.error("No camera found on this device");
        setIsScanning(false);
        return;
      }

      // 2. Select camera (priority: back camera)
      let selectedCamera = cameras[0];
      if (cameras.length > 1) {
        const backCamera = cameras.find(camera => 
          camera.label.toLowerCase().includes('back') || 
          camera.label.toLowerCase().includes('rear')
        );
        if (backCamera) {
          selectedCamera = backCamera;
        }
      }

      // 3. Initialize scanner with unique ID
      const scanner = new Html5Qrcode("qr-reader-login");
      scannerRef.current = scanner;

      // 4. Start scanner with camera.id
      await scanner.start(
        selectedCamera.id, // Use camera.id, not deviceId
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          // Success callback
          handleSuccessfulScan(decodedText);
        },
        (errorMessage) => {
          // Error callback - ignore during operation
        }
      );
    } catch (error: any) {
      handleScannerError(error);
    }
  }, 100); // 100ms delay is CRITICAL
};
```

### Key Implementation Details

#### 1. DOM Ready Delay (CRITICAL!)

```typescript
setTimeout(async () => {
  // Scanner initialization
}, 100);
```

**Why 100ms delay?**
- Ensures the target DOM element exists before initialization
- Prevents "Element not found" errors
- Required when scanner div is conditionally rendered

#### 2. Camera Enumeration

```typescript
const cameras = await Html5Qrcode.getCameras();
```

**Returns array of cameras with:**
```typescript
interface CameraDevice {
  id: string;        // Use this for scanner.start()
  label: string;     // Human-readable name
}
```

#### 3. Back Camera Priority

```typescript
const backCamera = cameras.find(camera => 
  camera.label.toLowerCase().includes('back') || 
  camera.label.toLowerCase().includes('rear')
);
```

**Why prioritize back camera?**
- Mobile devices: Back camera has better quality
- Better for scanning QR codes
- Fallback to front camera if not found

#### 4. Scanner Configuration

```typescript
await scanner.start(
  selectedCamera.id,  // Camera ID (not deviceId!)
  {
    fps: 10,          // Frames per second (10 is optimal)
    qrbox: { 
      width: 250,     // Scanning box width in pixels
      height: 250     // Scanning box height in pixels
    },
  },
  successCallback,    // Called when QR code detected
  errorCallback       // Called on scan errors (optional)
);
```

**Configuration Options:**
- `fps: 10` - Optimal balance between performance and battery
- `qrbox` - Visual guide for user positioning
- Can use `qrbox: 250` for square, or `{ width: 250, height: 250 }` for explicit dimensions

---

## Error Handling

### Comprehensive Error Handling

```typescript
const handleScannerError = (error: any) => {
  console.error("Error starting QR scanner:", error);
  setIsScanning(false);
  
  if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
    toast.error("Camera permission denied. Please allow camera access in your browser settings.");
  } else if (error.name === "NotFoundError") {
    toast.error("No camera found on this device");
  } else if (error.name === "NotReadableError") {
    toast.error("Camera is already in use by another application");
  } else {
    toast.error(`Error starting camera: ${error.message || "Unknown error"}`);
  }
};
```

### Common Error Types

| Error Name | Cause | User Action |
|------------|-------|-------------|
| `NotAllowedError` | User denied camera permission | Grant permission in browser settings |
| `PermissionDeniedError` | Camera permission blocked | Check browser/system settings |
| `NotFoundError` | No camera available | Use device with camera |
| `NotReadableError` | Camera in use by another app | Close other apps using camera |
| Generic | Other issues | Reload page, try different browser |

---

## Stopping the Scanner

### Proper Cleanup

```typescript
const stopScanning = async () => {
  if (scannerRef.current) {
    try {
      await scannerRef.current.stop();
      scannerRef.current = null;
    } catch (error) {
      console.error("Error stopping scanner:", error);
    }
  }
  setIsScanning(false);
};
```

**When to call stopScanning():**
- User clicks "Stop Scanning" button
- QR code successfully scanned
- Component unmounts (via useEffect cleanup)
- Navigation away from page

---

## UI Integration

### HTML Structure

```tsx
{!isScanning ? (
  <Button
    type="button"
    variant="outline"
    onClick={startScanning}
  >
    <QrCode className="mr-2 h-4 w-4" />
    Scan QR Code
  </Button>
) : (
  <div className="space-y-4">
    {/* Scanner container with unique ID */}
    <div
      id="qr-reader-login"
      ref={scannerDivRef}
      className="rounded-lg overflow-hidden border-2 border-primary"
    />
    <Button
      type="button"
      variant="destructive"
      onClick={stopScanning}
    >
      Stop Scanning
    </Button>
  </div>
)}
```

### Critical UI Requirements

1. **Unique ID**: The div MUST have a unique ID
   ```tsx
   id="qr-reader-login"  // Must be unique per page
   ```

2. **Conditional Rendering**: Scanner div should only render when scanning
   ```tsx
   {isScanning && <div id="qr-reader-login" />}
   ```

3. **Styling Recommendations**:
   ```tsx
   className="rounded-lg overflow-hidden border-2 border-primary"
   ```
   - `rounded-lg`: Rounded corners for aesthetics
   - `overflow-hidden`: Prevents video overflow
   - `border-2 border-primary`: Visual boundary

---

## Complete Code Example

### Full Component Implementation

```typescript
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrCode } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";

const QRScannerComponent = () => {
  const [scannedValue, setScannedValue] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivRef = useRef<HTMLDivElement>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const startScanning = async () => {
    setIsScanning(true);
    
    // CRITICAL: 100ms delay to ensure DOM is ready
    setTimeout(async () => {
      try {
        // 1. Enumerate cameras
        const cameras = await Html5Qrcode.getCameras();
        
        if (!cameras || cameras.length === 0) {
          toast.error("No camera found on this device");
          setIsScanning(false);
          return;
        }

        // 2. Select camera (priority: back camera)
        let selectedCamera = cameras[0];
        if (cameras.length > 1) {
          const backCamera = cameras.find(camera => 
            camera.label.toLowerCase().includes('back') || 
            camera.label.toLowerCase().includes('rear')
          );
          if (backCamera) {
            selectedCamera = backCamera;
          }
        }

        // 3. Initialize scanner
        const scanner = new Html5Qrcode("qr-reader");
        scannerRef.current = scanner;

        // 4. Start scanner
        await scanner.start(
          selectedCamera.id,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            setScannedValue(decodedText);
            stopScanning();
            toast.success("QR code scanned successfully!");
          },
          (errorMessage) => {
            // Ignore scan errors during operation
          }
        );
      } catch (error: any) {
        console.error("Error starting QR scanner:", error);
        setIsScanning(false);
        
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          toast.error("Camera permission denied. Please allow camera access in your browser settings.");
        } else if (error.name === "NotFoundError") {
          toast.error("No camera found on this device");
        } else if (error.name === "NotReadableError") {
          toast.error("Camera is already in use by another application");
        } else {
          toast.error(`Error starting camera: ${error.message || "Unknown error"}`);
        }
      }
    }, 100);
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (error) {
        console.error("Error stopping scanner:", error);
      }
    }
    setIsScanning(false);
  };

  return (
    <div className="space-y-4">
      <Input
        type="text"
        placeholder="Scanned value will appear here..."
        value={scannedValue}
        onChange={(e) => setScannedValue(e.target.value)}
        disabled={isScanning}
      />

      {!isScanning ? (
        <Button
          type="button"
          variant="outline"
          onClick={startScanning}
        >
          <QrCode className="mr-2 h-4 w-4" />
          Scan QR Code
        </Button>
      ) : (
        <div className="space-y-4">
          <div
            id="qr-reader"
            ref={scannerDivRef}
            className="rounded-lg overflow-hidden border-2 border-primary"
          />
          <Button
            type="button"
            variant="destructive"
            onClick={stopScanning}
          >
            Stop Scanning
          </Button>
        </div>
      )}
    </div>
  );
};

export default QRScannerComponent;
```

---

## Best Practices

### 1. Always Use Unique IDs

```typescript
// ✅ CORRECT - Unique ID per component
<div id="qr-reader-login" />
<div id="qr-reader-signup" />

// ❌ WRONG - Same ID used twice
<div id="qr-reader" />  // Page 1
<div id="qr-reader" />  // Page 2 (conflict!)
```

### 2. Implement Cleanup

```typescript
// ✅ CORRECT - Cleanup in useEffect
useEffect(() => {
  return () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
    }
  };
}, []);

// ❌ WRONG - No cleanup
// Camera stays active, memory leak!
```

### 3. Use setTimeout for DOM Ready

```typescript
// ✅ CORRECT - Wait for DOM
setTimeout(async () => {
  const scanner = new Html5Qrcode("qr-reader");
  // ...
}, 100);

// ❌ WRONG - Immediate initialization
const scanner = new Html5Qrcode("qr-reader"); // May fail!
```

### 4. Handle All Error Types

```typescript
// ✅ CORRECT - Specific error handling
if (error.name === "NotAllowedError") {
  toast.error("Camera permission denied");
} else if (error.name === "NotFoundError") {
  toast.error("No camera found");
}

// ❌ WRONG - Generic error only
toast.error("Error occurred");
```

### 5. Prioritize Back Camera

```typescript
// ✅ CORRECT - Find back camera
const backCamera = cameras.find(camera => 
  camera.label.toLowerCase().includes('back') || 
  camera.label.toLowerCase().includes('rear')
);

// ❌ WRONG - Always use first camera
const selectedCamera = cameras[0]; // May be front camera!
```

---

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: "Element not found" Error

**Symptom:**
```
Error: HTML Element with id=qr-reader not found
```

**Solution:**
```typescript
// Add 100ms delay before initialization
setTimeout(async () => {
  const scanner = new Html5Qrcode("qr-reader");
  // ...
}, 100);
```

#### Issue 2: Camera Permission Denied

**Symptom:**
```
NotAllowedError: Permission denied
```

**Solution:**
- Ensure HTTPS (required for camera access)
- Check browser settings
- Provide clear error message to user

```typescript
if (error.name === "NotAllowedError") {
  toast.error("Camera permission denied. Please allow camera access in your browser settings.");
}
```

#### Issue 3: Camera Already in Use

**Symptom:**
```
NotReadableError: Could not start video source
```

**Solution:**
- Implement proper cleanup in useEffect
- Stop scanner before navigating away
- Check no other tabs/apps using camera

#### Issue 4: Multiple Scanner Instances

**Symptom:**
Multiple camera feeds appear or errors about existing instances

**Solution:**
```typescript
// Always stop existing scanner before starting new one
if (scannerRef.current) {
  await scannerRef.current.stop();
}
const scanner = new Html5Qrcode("qr-reader");
scannerRef.current = scanner;
```

#### Issue 5: Scanner Not Stopping

**Symptom:**
Camera light stays on after navigation

**Solution:**
```typescript
// Proper cleanup in useEffect
useEffect(() => {
  return () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
    }
  };
}, []);
```

---

## Platform-Specific Considerations

### iOS Safari
- Requires HTTPS for camera access
- May show permission prompt every time
- Works best with back camera on iPhones

### Android Chrome
- Generally more permissive with camera access
- May remember camera permission
- Works well on most devices

### Desktop Browsers
- Chrome/Edge: Best support
- Firefox: Good support
- Safari: Requires HTTPS

### PWA (Progressive Web Apps)
- Camera access works in installed PWAs
- Same security requirements as web apps
- Better UX than in-browser experience

---

## Security Considerations

1. **HTTPS Required**
   - Camera access requires secure context (HTTPS)
   - Use HTTPS in production
   - localhost works for development

2. **User Permissions**
   - Always request permission gracefully
   - Provide clear explanation why camera is needed
   - Handle denied permissions gracefully

3. **Data Handling**
   - Validate scanned QR code data
   - Don't trust QR code content blindly
   - Sanitize before using in application

---

## Performance Optimization

### Recommended Settings

```typescript
{
  fps: 10,              // Good balance (don't go higher)
  qrbox: { 
    width: 250, 
    height: 250 
  },
  aspectRatio: 1.0,     // Optional: square aspect ratio
}
```

### Why fps: 10?
- Higher FPS = more battery consumption
- 10 FPS is sufficient for QR code scanning
- Better performance on older devices

---

## Testing Checklist

- [ ] Test on iOS Safari (iPhone)
- [ ] Test on Android Chrome
- [ ] Test on Desktop Chrome/Firefox/Safari
- [ ] Test camera permission denial
- [ ] Test with no camera available
- [ ] Test with camera already in use
- [ ] Test navigation during scanning
- [ ] Test cleanup on unmount
- [ ] Test with multiple QR codes in view
- [ ] Test in low light conditions

---

## Summary

### Critical Implementation Points

1. ✅ Use `useRef` to store scanner instance
2. ✅ Implement cleanup in `useEffect`
3. ✅ Add 100ms delay before initialization
4. ✅ Use `camera.id` not `deviceId`
5. ✅ Prioritize back camera on mobile
6. ✅ Handle all error types specifically
7. ✅ Use unique IDs for scanner divs
8. ✅ Stop scanner before unmount

### Quick Reference

```typescript
// Essential pattern
const scannerRef = useRef<Html5Qrcode | null>(null);

useEffect(() => {
  return () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
    }
  };
}, []);

setTimeout(async () => {
  const cameras = await Html5Qrcode.getCameras();
  const scanner = new Html5Qrcode("unique-id");
  await scanner.start(cameras[0].id, config, successCb, errorCb);
}, 100);
```

---

## Real-World Usage

This implementation is production-tested in:
- **LANA Wallet Login** - Scanning private key QR codes
- Works across iOS Safari, Android Chrome, Desktop browsers
- Zero reported issues with scanner initialization or cleanup
- Handles all edge cases gracefully

---

**Last Updated**: November 2025  
**Based On**: Login.tsx implementation in LANA application

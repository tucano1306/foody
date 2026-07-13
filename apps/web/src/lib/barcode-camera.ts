/**
 * barcode-camera.ts
 * Camera + 1D-barcode scanning plumbing shared by BarcodeScanner (product
 * creation) and ProductScanSearch (find a pantry product with the camera).
 *
 * Client-side only: everything here touches getUserMedia / video elements.
 */

export interface ScanControls {
  stop: () => void;
}

// Cap the camera feed: default constraints can open 4K streams on modern
// phones, and every frame gets copied for decoding — a common OOM source.
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: 'environment',
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

// Only 1D product formats — skipping QR/PDF417/Aztec/DataMatrix cuts the
// per-frame decode work to a fraction.
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];
const NATIVE_SCAN_INTERVAL_MS = 150;

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

/**
 * Hardware-accelerated scanning via the native BarcodeDetector API
 * (Chrome/Android). Returns null when unavailable so the caller can fall
 * back to ZXing; camera errors propagate to the caller.
 */
export async function startNativeDetector(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
): Promise<ScanControls | null> {
  const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Detector) return null;

  let detector: BarcodeDetectorLike;
  try {
    const supported = (await Detector.getSupportedFormats?.()) ?? [];
    const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
    if (formats.length === 0) return null;
    detector = new Detector({ formats });
  } catch {
    return null;
  }

  const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
  video.srcObject = stream;
  await video.play().catch(() => undefined);

  let stopped = false;
  const stop = () => {
    stopped = true;
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };

  void (async () => {
    while (!stopped) {
      if (video.readyState >= 2) {
        try {
          const codes = await detector.detect(video);
          if (!stopped && codes.length > 0 && codes[0].rawValue) {
            onCode(codes[0].rawValue);
            return;
          }
        } catch {
          // Frame not decodable yet — keep polling
        }
      }
      await new Promise((r) => setTimeout(r, NATIVE_SCAN_INTERVAL_MS));
    }
  })();

  return { stop };
}

/** ZXing fallback, restricted to 1D product formats via decode hints. */
export async function startZxingScanner(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
): Promise<ScanControls> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);

  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF,
  ]);

  const codeReader = new BrowserMultiFormatReader(hints);
  const controls = await codeReader.decodeFromConstraints(CAMERA_CONSTRAINTS, video, (result) => {
    if (result) onCode(result.getText());
  });
  return { stop: () => controls.stop() };
}

/**
 * Plain camera preview with no barcode decoding — last resort so the user can
 * still photograph the product when both barcode engines are unavailable.
 */
export async function startPlainCamera(video: HTMLVideoElement): Promise<ScanControls> {
  const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
  video.srcObject = stream;
  await video.play().catch(() => undefined);
  return {
    stop: () => {
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}

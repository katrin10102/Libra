import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  GlobalHistogramBinarizer
} from '@zxing/library';
import Quagga from '@ericblade/quagga2';

// Supported formats for ISBN & general book barcodes
const ZXING_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39
];

const zxingHints = new Map();
zxingHints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
zxingHints.set(DecodeHintType.TRY_HARDER, true);

const zxingReader = new MultiFormatReader();
zxingReader.setHints(zxingHints);

/**
 * Checks if the browser natively supports BarcodeDetector API (iOS 17+, Android Chrome, etc.)
 */
export async function getNativeBarcodeDetector(): Promise<any | null> {
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const detectorClass = (window as any).BarcodeDetector;
      const supported = await detectorClass.getSupportedFormats();
      if (supported && (supported.includes('ean_13') || supported.includes('ean-13') || supported.length > 0)) {
        return new detectorClass({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
        });
      }
    } catch (e) {
      console.warn('Native BarcodeDetector initialization skipped:', e);
    }
  }
  return null;
}

/**
 * Normalizes barcode string to standard numbers
 */
export function cleanBarcodeResult(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\dX]/gi, '');
  if (digits.length === 10 || digits.length === 13) {
    return digits;
  }
  if (digits.length >= 8) {
    return digits;
  }
  return raw.trim();
}

/**
 * Decodes barcode from an HTMLCanvasElement using ZXing
 */
export function decodeCanvasWithZXing(canvas: HTMLCanvasElement): string | null {
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const len = canvas.width * canvas.height;
    const luminances = new Uint8ClampedArray(len);
    for (let i = 0; i < len; i++) {
      const offset = i * 4;
      // Standard luminance calculation
      luminances[i] = (imageData.data[offset] * 306 + imageData.data[offset + 1] * 601 + imageData.data[offset + 2] * 117) >> 10;
    }

    const lumSource = new RGBLuminanceSource(luminances, canvas.width, canvas.height);
    
    // Try HybridBinarizer first
    try {
      const bitmap = new BinaryBitmap(new HybridBinarizer(lumSource));
      const res = zxingReader.decode(bitmap);
      if (res && res.getText()) return res.getText();
    } catch {}

    // Fallback to GlobalHistogramBinarizer
    try {
      const bitmap2 = new BinaryBitmap(new GlobalHistogramBinarizer(lumSource));
      const res2 = zxingReader.decode(bitmap2);
      if (res2 && res2.getText()) return res2.getText();
    } catch {}
  } catch {}
  return null;
}

/**
 * Decodes barcode from an image file (e.g. from camera capture on iPhone)
 * Uses multi-pass image processing (downscaling, contrast enhancement, rotations, center crops)
 */
export async function decodeBarcodeFromFile(file: File): Promise<string | null> {
  // 1. Convert file to HTMLImageElement
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const nativeDetector = await getNativeBarcodeDetector();

  // 2. Try native BarcodeDetector directly on the image element
  if (nativeDetector) {
    try {
      const nativeResults = await nativeDetector.detect(img);
      if (nativeResults && nativeResults.length > 0) {
        for (const item of nativeResults) {
          const val = cleanBarcodeResult(item.rawValue || item.rawValueText);
          if (val) return val;
        }
      }
    } catch (e) {
      console.warn('Native detector on image failed:', e);
    }
  }

  // 3. Multi-resolution and multi-orientation canvas passes
  // iPhone photos can be 12MP-48MP (e.g. 4032x3024). Barcode algorithms fail on huge pixel sizes.
  // Best target widths: 1200px, 800px, 1600px
  const targetWidths = [1000, 700, 1400];

  for (const tw of targetWidths) {
    const scale = Math.min(1, tw / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) continue;

    // Normal draw
    ctx.drawImage(img, 0, 0, w, h);

    // Native detection on scaled canvas
    if (nativeDetector) {
      try {
        const results = await nativeDetector.detect(canvas);
        if (results && results.length > 0) {
          for (const item of results) {
            const val = cleanBarcodeResult(item.rawValue);
            if (val) return val;
          }
        }
      } catch {}
    }

    // ZXing on scaled canvas
    const zxRes = decodeCanvasWithZXing(canvas);
    if (zxRes) {
      const clean = cleanBarcodeResult(zxRes);
      if (clean) return clean;
    }

    // Quagga2 decode on canvas data URL
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const qRes = await new Promise<string | null>((res) => {
        Quagga.decodeSingle({
          src: dataUrl,
          numOfWorkers: 0,
          decoder: {
            readers: [
              'ean_reader',
              'ean_8_reader',
              'upc_reader',
              'upc_e_reader',
              'code_128_reader',
              'code_39_reader'
            ]
          },
          locate: true
        }, (result) => {
          if (result && result.codeResult && result.codeResult.code) {
            res(result.codeResult.code);
          } else {
            res(null);
          }
        });
      });

      if (qRes) {
        const clean = cleanBarcodeResult(qRes);
        if (clean) return clean;
      }
    } catch {}

    // 4. Try center crop pass (focus on middle 60% where users place the barcode)
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = Math.round(w * 0.8);
    cropCanvas.height = Math.round(h * 0.5);
    const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
    if (cropCtx) {
      cropCtx.drawImage(
        canvas,
        Math.round(w * 0.1),
        Math.round(h * 0.25),
        cropCanvas.width,
        cropCanvas.height,
        0,
        0,
        cropCanvas.width,
        cropCanvas.height
      );

      if (nativeDetector) {
        try {
          const res = await nativeDetector.detect(cropCanvas);
          if (res && res.length > 0) {
            const clean = cleanBarcodeResult(res[0].rawValue);
            if (clean) return clean;
          }
        } catch {}
      }

      const cropZx = decodeCanvasWithZXing(cropCanvas);
      if (cropZx) {
        const clean = cleanBarcodeResult(cropZx);
        if (clean) return clean;
      }
    }
  }

  return null;
}

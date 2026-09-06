// Client-side crop + downscale + upload helper — port of NocoBase's
// lib_attachment_upload. Crop genuinely has to happen in the browser (it needs
// the CropModal's user-picked rect). The downscale half is ALSO done here, even
// though /api/attachments re-encodes server-side (see resizeImageIfNeeded):
// nginx caps request bodies (client_max_body_size), and on 2026-08-20 a 5.4MB
// iPad photo was rejected with a 413 before the app ever saw it — "Skip crop"
// looked dead on iPad while "Crop & Upload" worked, purely because cropping
// happened to re-encode the file down under the limit. Shrinking to the same
// 1600px the server would produce anyway removes that cliff and saves a lot of
// mobile data. Both steps degrade to uploading the original on any failure.

import type { CropRect } from '../ui/CropModal';

// Mirrors src/lib/image-resize.ts (server) so the two stages agree.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;
// Below this, an uncropped image is posted as-is: re-encoding a small file
// costs quality for no benefit. Comfortably under every environment's body cap.
const REENCODE_ABOVE_BYTES = 1.5 * 1024 * 1024;

function loadImage(file: File | Blob): Promise<{ img: HTMLImageElement; revoke: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, revoke: () => URL.revokeObjectURL(url) });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('failed to decode source image')); };
    img.src = url;
  });
}

// -> Promise<Blob>. Crops to `crop` (in the SOURCE image's own pixel
// coordinates, which is what CropModal hands back) and/or scales the result to
// fit MAX_DIMENSION, then re-encodes as JPEG. Transparent areas flatten to
// white, matching the server's `.flatten({ background: '#ffffff' })`. EXIF
// orientation is applied by the browser when the <img> decodes, so the output
// is already upright and the server's `.rotate()` becomes a no-op.
function renderToBlob(file: File | Blob, crop: CropRect | null): Promise<Blob> {
  return loadImage(file).then(({ img, revoke }) => {
    revoke();
    const sx = crop ? crop.x || 0 : 0;
    const sy = crop ? crop.y || 0 : 0;
    const sw = crop ? crop.width : img.naturalWidth;
    const sh = crop ? crop.height : img.naturalHeight;
    if (!sw || !sh) throw new Error('source has zero width/height');

    const scale = Math.min(1, MAX_DIMENSION / Math.max(sw, sh));
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));

    const canvas = document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, dw, dh);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
        'image/jpeg',
        JPEG_QUALITY,
      );
    });
  });
}

// True when the file is a raster image we can safely re-encode. SVG has no
// meaningful pixel size to scale, and the server passes it through untouched.
function isReencodable(file: File | Blob): boolean {
  const type = file.type || '';
  return type.startsWith('image/') && type !== 'image/svg+xml';
}

export interface UploadedAttachment {
  id: string;
  url: string;
  filename: string;
}

// Crop (optional) + downscale, then POST. Neither transform is allowed to block
// the upload: any failure falls back to posting the original file, same policy
// as the NocoBase original.
export async function uploadAttachment(file: File, opts?: { crop?: CropRect | null }): Promise<UploadedAttachment> {
  const crop = opts?.crop ?? null;
  let payload: File | Blob = file;
  if (isReencodable(file) && (crop || file.size > REENCODE_ABOVE_BYTES)) {
    try {
      payload = await renderToBlob(file, crop);
    } catch (e) {
      console.warn('[attachment-upload] crop/downscale failed, uploading original:', e);
      payload = file;
    }
  }
  const form = new FormData();
  form.append('file', payload, file.name);
  const res = await fetch('/api/attachments', { method: 'POST', body: form });
  // nginx's own 413/502 pages are HTML, not JSON — don't let res.json() throw
  // and mask the real status.
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 413) throw new Error('Image too large to upload — try a smaller photo.');
    throw new Error(json?.error || `Upload failed (${res.status})`);
  }
  return { id: json.id, url: json.url, filename: json.filename };
}

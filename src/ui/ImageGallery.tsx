'use client';

// Hero image + thumbnail strip, matching the approved NocoBase reference.
// Framed in a soft paper background so the photo reads like it's sitting on
// a tray, with the active thumbnail ringed.

import { useState } from 'react';
import { atWidth } from '../lib/file-url';

export function ImageGallery({ images, aspectRatio = '2 / 3' }: { images: string[]; aspectRatio?: string }) {
  const [active, setActive] = useState(0);
  if (!images.length) return null;

  return (
    <div style={{ background: '#f4f2ee', border: '1px solid #e7e2d9', borderRadius: 10, padding: 10, marginBottom: 16 }}>
      <div style={{ width: '100%', aspectRatio, borderRadius: 6, overflow: 'hidden', background: '#e7e2d9' }}>
        <img src={images[active]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
      {images.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto' }}>
          {images.map((src, i) => (
            <button
              key={src + i}
              onClick={() => setActive(i)}
              style={{
                width: 52, height: 78, borderRadius: 6, overflow: 'hidden', padding: 0, flexShrink: 0, cursor: 'pointer',
                border: i === active ? '2px solid #26344b' : '1px solid #e7e2d9', background: 'none',
              }}
            >
              {/* Filmstrip tiles are 52px — pull a 200px copy even though the
                  array holds full-size urls for the main image above. */}
              <img src={atWidth(src, 200)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

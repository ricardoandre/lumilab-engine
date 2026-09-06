'use client';

// Shared drag-to-select crop UI — port of NocoBase's lib_image_crop_modal.
// Shows `file` at its displayed (scaled-to-fit) size, lets the user drag a
// rectangle over it, and converts that rectangle from DISPLAYED pixels to
// the image's NATURAL pixels before calling onDone. "Skip crop" and a rect
// smaller than 4px in either dimension both resolve with null, meaning
// "upload as-is". onDone is called exactly once per mount; the caller is
// expected to unmount (or swap `file`) after.
//
// Drags are POINTER events, not mouse events: iOS Safari never emits the
// mousemove stream for a finger drag (it pans instead), so the mouse-only
// version left iPad users with no way to select a rect at all — "Skip crop"
// was the only reachable outcome. Pointer events cover mouse, finger and
// Pencil in one path, and `touchAction: 'none'` stops Safari from stealing
// the gesture as a scroll. That last part is also why the image is now
// SIZED TO FIT instead of sitting in a scrollable box: with the gesture
// claimed for cropping, a scroll container underneath would be unreachable
// by finger, so a tall portrait photo could never be scrolled into view.

import { useEffect, useRef, useState } from 'react';
import { Modal } from 'antd';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Matches the old scroll box's maxHeight, so the crop area is the same size
// it has always been on desktop — tall images now shrink to fit it instead
// of overflowing into a scrollbar.
const MAX_IMAGE_HEIGHT = 420;

export function CropModal({ file, onDone }: { file: File | Blob; onDone: (rect: CropRect | null) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [natSize, setNatSize] = useState<{ w: number; h: number } | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    setNatSize(null);
    setRect(null);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  function toContainerPoint(e: React.PointerEvent) {
    const r = containerRef.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max(e.clientX - r.left, 0), r.width),
      y: Math.min(Math.max(e.clientY - r.top, 0), r.height),
    };
  }

  function handleImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    setNatSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
  }
  function handlePointerDown(e: React.PointerEvent) {
    // Capture so a drag that wanders off the image keeps reporting to us
    // (and so the browser can't reinterpret it mid-gesture). Throws if the
    // pointer is already gone — harmless, the drag just isn't captured.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    const p = toContainerPoint(e);
    setDragStart(p);
    setRect({ x: p.x, y: p.y, w: 0, h: 0 });
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragStart) return;
    const p = toContainerPoint(e);
    setRect({
      x: Math.min(dragStart.x, p.x), y: Math.min(dragStart.y, p.y),
      w: Math.abs(p.x - dragStart.x), h: Math.abs(p.y - dragStart.y),
    });
  }
  function handlePointerUp(e: React.PointerEvent) {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { /* never captured */ }
    setDragStart(null);
  }

  function confirmCrop() {
    if (!rect || rect.w < 4 || rect.h < 4 || !natSize || !containerRef.current) {
      onDone(null);
      return;
    }
    const dispRect = containerRef.current.getBoundingClientRect();
    const scaleX = natSize.w / dispRect.width;
    const scaleY = natSize.h / dispRect.height;
    onDone({
      x: Math.round(rect.x * scaleX),
      y: Math.round(rect.y * scaleY),
      width: Math.round(rect.w * scaleX),
      height: Math.round(rect.h * scaleY),
    });
  }

  const hasRect = !!(rect && rect.w >= 4 && rect.h >= 4);

  return (
    <Modal
      open
      title="Crop image (optional)"
      width={560}
      onCancel={() => onDone(null)}
      maskClosable={false}
      footer={[
        <button
          key="skip" onClick={() => onDone(null)}
          style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', color: '#64748b' }}
        >
          Skip crop
        </button>,
        <button
          key="crop" onClick={confirmCrop} disabled={!hasRect}
          style={{ padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: hasRect ? 'pointer' : 'default', border: 'none', borderRadius: 6, background: hasRect ? '#6366f1' : '#c7c2ff', color: '#fff', marginLeft: 8 }}
        >
          Crop &amp; Upload
        </button>,
      ]}
    >
      <div style={{ textAlign: 'center', borderRadius: 6 }}>
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
          // The container hugs the image exactly (inline-block + lineHeight 0),
          // which is what lets confirmCrop scale from its rect to natural px.
          style={{ position: 'relative', display: 'inline-block', lineHeight: 0, maxWidth: '100%', cursor: 'crosshair', userSelect: 'none', touchAction: 'none', background: '#0f172a' }}
        >
          {url && <img src={url} onLoad={handleImgLoad} draggable={false} style={{ maxWidth: '100%', maxHeight: MAX_IMAGE_HEIGHT, display: 'block', pointerEvents: 'none' }} />}
          {rect && (
            <div style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, border: '2px solid #6366f1', background: 'rgba(99,102,241,0.15)', pointerEvents: 'none' }} />
          )}
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>Drag on the image to select a crop area, or skip to upload the full image.</div>
    </Modal>
  );
}

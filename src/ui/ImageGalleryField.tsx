'use client';

// Multi-image upload control for FieldType 'imageGallery' — a grid of
// thumbnails (remove button on each) plus an upload tile to add more.
// Unlike ImageUploadField (single Attachment id), this holds an array of
// {attachmentId, url} and is meant for resources with a real join table
// behind them (Sample.images, SampleVariant.images/qcImages, ...) — see
// src/lib/gallery-sync.ts for how the API syncs the submitted array back to
// that join table.

import { useState } from 'react';
import { App, Upload } from 'antd';
import { PlusOutlined, LoadingOutlined, CloseOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { uploadAttachment } from '../lib/attachment-upload';

export interface GalleryItem {
  attachmentId: string;
  url: string;
}

export function ImageGalleryField({ value, onChange, addLabel }: {
  value?: GalleryItem[];
  onChange?: (items: GalleryItem[]) => void;
  addLabel?: string;
}) {
  const { message } = App.useApp();
  const items = value ?? [];
  const [uploading, setUploading] = useState(false);

  const props: UploadProps = {
    showUploadList: false,
    accept: 'image/*',
    beforeUpload: async (file) => {
      setUploading(true);
      try {
        const att = await uploadAttachment(file);
        onChange?.([...items, { attachmentId: att.id, url: att.url }]);
      } catch (e: any) {
        message.error(e.message || 'Upload failed');
      } finally {
        setUploading(false);
      }
      return false;
    },
  };

  function remove(i: number) {
    onChange?.(items.filter((_, idx) => idx !== i));
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {items.map((item, i) => (
        <div key={item.attachmentId} className="kano-upload-thumb" style={{ position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
          <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <button
            type="button"
            aria-label="Remove image"
            onClick={() => remove(i)}
            style={{
              position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 6, border: 'none',
              background: 'rgba(33,31,28,0.55)', color: '#fff', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', fontSize: 11,
            }}
          >
            <CloseOutlined />
          </button>
        </div>
      ))}
      <Upload {...props} listType="picture-card" className="kano-image-upload">
        <div>
          {uploading ? <LoadingOutlined /> : <PlusOutlined />}
          <div style={{ marginTop: 8, fontSize: 12 }}>{addLabel ?? 'Add'}</div>
        </div>
      </Upload>
    </div>
  );
}

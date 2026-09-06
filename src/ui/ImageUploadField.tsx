'use client';

// Image upload control for form fields (FieldType 'image'): uploads to the
// existing /api/attachments endpoint (real Attachment row + file storage),
// then the form field just holds the resulting attachment id — same shape
// as any other *Id relation column (see Product.imageId).

import { useState } from 'react';
import { App, Upload } from 'antd';
import { PlusOutlined, LoadingOutlined, CloseOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { uploadAttachment } from '../lib/attachment-upload';

export function ImageUploadField({ value, onChange, initialUrl }: {
  value?: string | number;
  onChange?: (id: string | undefined) => void;
  initialUrl?: string;
}) {
  const { message } = App.useApp();
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(initialUrl);
  const [uploading, setUploading] = useState(false);

  const props: UploadProps = {
    showUploadList: false,
    accept: 'image/*',
    beforeUpload: async (file) => {
      setUploading(true);
      try {
        const att = await uploadAttachment(file);
        setPreviewUrl(att.url);
        onChange?.(att.id);
      } catch (e: any) {
        message.error(e.message || 'Upload failed');
      } finally {
        setUploading(false);
      }
      return false;
    },
  };

  return (
    <div>
      <Upload {...props} listType="picture-card" className="kano-image-upload">
        {previewUrl ? (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <img src={previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button
              type="button"
              aria-label="Remove image"
              onClick={(e) => { e.stopPropagation(); setPreviewUrl(undefined); onChange?.(undefined); }}
              style={{
                position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 6, border: 'none',
                background: 'rgba(33,31,28,0.55)', color: '#fff', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', fontSize: 11,
              }}
            >
              <CloseOutlined />
            </button>
          </div>
        ) : (
          <div>
            {uploading ? <LoadingOutlined /> : <PlusOutlined />}
            <div style={{ marginTop: 8, fontSize: 12 }}>Upload</div>
          </div>
        )}
      </Upload>
    </div>
  );
}

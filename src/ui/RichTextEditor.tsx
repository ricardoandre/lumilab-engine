'use client';

// WYSIWYG editor for 'richtext' fields (e.g. Task/Sample description),
// stored as HTML — see RichTextValue for the read-side sanitized renderer.
// Deliberately just the formatting a task description needs (bold/italic,
// lists, links, headings) — not a general-purpose document editor.

import { useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Button, Divider } from 'antd';
import {
  BoldOutlined,
  ItalicOutlined,
  StrikethroughOutlined,
  UnorderedListOutlined,
  OrderedListOutlined,
  LinkOutlined,
  PictureOutlined,
  LoadingOutlined,
  UndoOutlined,
  RedoOutlined,
} from '@ant-design/icons';

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  onUploadImage,
  readOnly,
}: {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  // Shown, but not editable — the form engine passes this for a field marked
  // FieldConfig.disabled.
  readOnly?: boolean;
  // Optional — omit to get an editor with no image button. Expected to
  // resolve with the uploaded image's URL, which is inserted at the cursor.
  onUploadImage?: (file: File) => Promise<string>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imgUploading, setImgUploading] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      Placeholder.configure({ placeholder: placeholder ?? 'Write a description...' }),
    ],
    content: value ?? '',
    // Tiptap's own switch — a read-only editor still renders and scrolls, it
    // just refuses input. The toolbar is dropped below to match.
    editable: !readOnly,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    editorProps: {
      attributes: { class: 'kano-richtext kano-richtext-input' },
    },
  });

  if (!editor) return null;

  function handleImageButtonClick() {
    if (imgUploading || !fileInputRef.current) return;
    fileInputRef.current.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUploadImage) return;
    setImgUploading(true);
    onUploadImage(file)
      .then((url) => {
        if (!url) throw new Error('Upload did not return a URL.');
        editor!.chain().focus().setImage({ src: url }).run();
      })
      .catch((err) => console.error('RichTextEditor image upload failed:', err))
      .finally(() => setImgUploading(false));
  }

  function toggleLink() {
    const prevUrl = editor!.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', prevUrl ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor!.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor!.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  return (
    <div className="kano-richtext-editor">
      {readOnly ? null : (
      <div className="kano-richtext-toolbar">
        <ToolbarBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} icon={<BoldOutlined />} />
        <ToolbarBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} icon={<ItalicOutlined />} />
        <ToolbarBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} icon={<StrikethroughOutlined />} />
        <Divider type="vertical" style={{ margin: '0 2px' }} />
        <ToolbarBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} icon={<UnorderedListOutlined />} />
        <ToolbarBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} icon={<OrderedListOutlined />} />
        <Divider type="vertical" style={{ margin: '0 2px' }} />
        <ToolbarBtn active={editor.isActive('link')} onClick={toggleLink} icon={<LinkOutlined />} />
        {onUploadImage && (
          <>
            <Divider type="vertical" style={{ margin: '0 2px' }} />
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
            <ToolbarBtn
              onClick={handleImageButtonClick}
              icon={imgUploading ? <LoadingOutlined /> : <PictureOutlined />}
            />
          </>
        )}
        <Divider type="vertical" style={{ margin: '0 2px' }} />
        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} icon={<UndoOutlined />} />
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} icon={<RedoOutlined />} />
      </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarBtn({ icon, active, onClick }: { icon: React.ReactNode; active?: boolean; onClick: () => void }) {
  return (
    <Button
      type={active ? 'primary' : 'text'}
      size="small"
      icon={icon}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    />
  );
}

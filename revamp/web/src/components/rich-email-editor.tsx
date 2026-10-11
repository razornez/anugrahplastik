"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { useRef, useState } from "react";
import { uploadEmailTemplateImage } from "@/features/integrations/email-template-actions";
import type { EmailNode } from "@/features/integrations/email-templates";
import { emailVariableLabels } from "./email-variable-labels";

const extensions = [
  StarterKit.configure({ link: false, underline: false }),
  Link.configure({ openOnClick: false, autolink: false, protocols: ["https", "mailto"] }),
  Underline,
  Image.configure({ inline: false, allowBase64: false }),
  TableKit.configure({ table: { resizable: false } }),
  TextAlign.configure({ types: ["paragraph", "heading"] }),
];

export function RichEmailEditor({
  initial,
  name = "content",
  onChange,
  canUpload = false,
  variables = [],
}: {
  initial: EmailNode;
  name?: string;
  onChange?: (value: EmailNode) => void;
  canUpload?: boolean;
  variables?: string[];
}) {
  const [value, setValue] = useState<EmailNode>(initial);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    extensions,
    content: initial,
    immediatelyRender: false,
    editorProps: { attributes: { role: "textbox", "aria-label": "Isi email", "aria-multiline": "true" } },
    onUpdate({ editor: instance }) {
      const next = instance.getJSON() as EmailNode;
      setValue(next);
      onChange?.(next);
    },
  });

  async function addImage(file?: File) {
    if (!file || !editor) return;
    setError("");
    try {
      const data = new FormData();
      data.set("file", file);
      const result = await uploadEmailTemplateImage(data);
      editor.chain().focus().setImage({ src: result.url, alt: file.name }).run();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gambar tidak dapat diunggah.");
    }
  }

  function addLink() {
    if (!editor) return;
    const href = window.prompt("Alamat tautan HTTPS atau email (mailto:)", "https://");
    if (href === null) return;
    if (!/^(https:\/\/|mailto:)/i.test(href)) {
      setError("Gunakan tautan HTTPS atau mailto.");
      return;
    }
    editor.chain().focus().setLink({ href }).run();
  }

  return (
    <div className="rich-email-editor">
      <div className="rich-email-editor__toolbar" role="toolbar" aria-label="Format email">
        <button
          type="button"
          aria-label="Tebal"
          aria-pressed={editor?.isActive("bold") ?? false}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          aria-label="Miring"
          aria-pressed={editor?.isActive("italic") ?? false}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          aria-label="Garis bawah"
          aria-pressed={editor?.isActive("underline") ?? false}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <u>U</u>
        </button>
        <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          Daftar
        </button>
        <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          Nomor
        </button>
        <button type="button" onClick={addLink}>
          Tautan
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()}
        >
          Tabel
        </button>
        {canUpload ? (
          <button type="button" onClick={() => fileInput.current?.click()}>
            Gambar
          </button>
        ) : null}
        <button type="button" onClick={() => editor?.chain().focus().undo().run()}>
          Urungkan
        </button>
        <button type="button" onClick={() => editor?.chain().focus().redo().run()}>
          Ulangi
        </button>
      </div>
      {variables.length ? (
        <label className="rich-email-editor__variables">
          Sisipkan data otomatis
          <select
            aria-label="Sisipkan data otomatis"
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) editor?.chain().focus().insertContent(`{{${event.target.value}}}`).run();
              event.target.value = "";
            }}
          >
            <option value="">Pilih data…</option>
            {variables.map((variable) => (
              <option key={variable} value={variable}>
                {emailVariableLabels[variable] ?? variable}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <EditorContent editor={editor} aria-label="Isi email" className="rich-email-editor__canvas" />
      <input type="hidden" name={name} value={JSON.stringify(value)} readOnly />
      {canUpload ? (
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(event) => void addImage(event.target.files?.[0])}
        />
      ) : null}
      {error ? (
        <p className="integration-alert" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

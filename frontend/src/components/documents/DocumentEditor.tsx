'use client'

import { useEffect } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import { TableKit } from '@tiptap/extension-table'
import Placeholder from '@tiptap/extension-placeholder'
import { TextStyleKit } from '@tiptap/extension-text-style'
import Image from '@tiptap/extension-image'

interface DocumentEditorProps {
  html: string
  onChange: (html: string) => void
  onEditorReady: (editor: Editor | null) => void
  onSelectionChange?: (selectedText: string) => void
}

export function DocumentEditor({
  html,
  onChange,
  onEditorReady,
  onSelectionChange,
}: DocumentEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      TableKit.configure({ table: { resizable: true } }),
      Placeholder.configure({
        placeholder: 'Start writing, or ask IQ to create a first draft…',
      }),
      TextStyleKit,
      Image.configure({ allowBase64: true }),
    ],
    content: html,
    editorProps: {
      attributes: {
        class: 'iq-document-content',
        'aria-label': 'Document content',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getHTML()),
    onSelectionUpdate: ({ editor: currentEditor }) => {
      const { from, to } = currentEditor.state.selection
      onSelectionChange?.(currentEditor.state.doc.textBetween(from, to, ' ').trim())
    },
  })

  useEffect(() => {
    onEditorReady(editor)
    return () => onEditorReady(null)
  }, [editor, onEditorReady])

  useEffect(() => {
    if (!editor || editor.isDestroyed || editor.getHTML() === html) return
    editor.commands.setContent(html, { emitUpdate: false })
  }, [editor, html])

  return <EditorContent editor={editor} />
}

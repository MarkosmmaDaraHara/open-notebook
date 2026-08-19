'use client'

import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  FileDown,
  FilePenLine,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Sparkles,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
} from 'lucide-react'

type RibbonTab = 'File' | 'Home' | 'Insert' | 'Layout' | 'Review'

interface DocumentToolbarProps {
  editor: Editor | null
  onExport: () => void
  onOpenFullEditor: () => void
  onOpenIQ: () => void
}

function ToolButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className="iq-tool-button"
      data-active={active || undefined}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function DocumentToolbar({
  editor,
  onExport,
  onOpenFullEditor,
  onOpenIQ,
}: DocumentToolbarProps) {
  const [activeTab, setActiveTab] = useState<RibbonTab>('Home')
  const [, setRevision] = useState(0)

  useEffect(() => {
    if (!editor) return
    const refresh = () => setRevision((value) => value + 1)
    editor.on('transaction', refresh)
    return () => {
      editor.off('transaction', refresh)
    }
  }, [editor])

  const focus = () => editor?.chain().focus()
  const setLink = () => {
    if (!editor) return
    const previousUrl = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Paste a link', previousUrl ?? 'https://')
    if (url === null) return
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }
  const addImage = () => {
    if (!editor) return
    const url = window.prompt('Paste an image URL')
    if (url?.trim()) editor.chain().focus().setImage({ src: url.trim() }).run()
  }

  const homeRibbon = (
    <>
      <div className="iq-tool-group">
        <ToolButton label="Undo" disabled={!editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}>
          <Undo2 />
        </ToolButton>
        <ToolButton label="Redo" disabled={!editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}>
          <Redo2 />
        </ToolButton>
      </div>
      <div className="iq-tool-group iq-select-group">
        <label>
          <span className="sr-only">Paragraph style</span>
          <select
            aria-label="Paragraph style"
            value={editor?.isActive('heading', { level: 1 }) ? 'h1' : editor?.isActive('heading', { level: 2 }) ? 'h2' : editor?.isActive('heading', { level: 3 }) ? 'h3' : 'p'}
            onChange={(event) => {
              const value = event.target.value
              if (value === 'p') editor?.chain().focus().setParagraph().run()
              else editor?.chain().focus().toggleHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run()
            }}
          >
            <option value="p">Normal</option>
            <option value="h1">Title</option>
            <option value="h2">Heading 1</option>
            <option value="h3">Heading 2</option>
          </select>
          <ChevronDown aria-hidden="true" />
        </label>
        <label>
          <span className="sr-only">Font family</span>
          <select
            aria-label="Font family"
            defaultValue="Aptos"
            onChange={(event) => editor?.chain().focus().setFontFamily(event.target.value).run()}
          >
            <option>Aptos</option>
            <option>Arial</option>
            <option>Georgia</option>
            <option>Times New Roman</option>
            <option>Verdana</option>
          </select>
          <ChevronDown aria-hidden="true" />
        </label>
        <label className="iq-font-size-select">
          <span className="sr-only">Font size</span>
          <select
            aria-label="Font size"
            defaultValue="15"
            onChange={(event) => editor?.chain().focus().setFontSize(`${event.target.value}px`).run()}
          >
            {[11, 12, 14, 15, 16, 18, 20, 24, 32, 40].map((size) => <option key={size}>{size}</option>)}
          </select>
          <ChevronDown aria-hidden="true" />
        </label>
      </div>
      <div className="iq-tool-group">
        <ToolButton label="Bold" active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold /></ToolButton>
        <ToolButton label="Italic" active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic /></ToolButton>
        <ToolButton label="Underline" active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()}><Underline /></ToolButton>
        <ToolButton label="Strikethrough" active={editor?.isActive('strike')} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough /></ToolButton>
        <label className="iq-color-button" title="Text color">
          <span>A</span>
          <input
            aria-label="Text color"
            type="color"
            defaultValue="#172033"
            onChange={(event) => editor?.chain().focus().setColor(event.target.value).run()}
          />
        </label>
        <label className="iq-color-button iq-highlight-button" title="Highlight color">
          <span>ab</span>
          <input
            aria-label="Highlight color"
            type="color"
            defaultValue="#dce7ff"
            onChange={(event) => editor?.chain().focus().toggleHighlight({ color: event.target.value }).run()}
          />
        </label>
      </div>
      <div className="iq-tool-group">
        <ToolButton label="Align left" active={editor?.isActive({ textAlign: 'left' })} onClick={() => editor?.chain().focus().setTextAlign('left').run()}><AlignLeft /></ToolButton>
        <ToolButton label="Align center" active={editor?.isActive({ textAlign: 'center' })} onClick={() => editor?.chain().focus().setTextAlign('center').run()}><AlignCenter /></ToolButton>
        <ToolButton label="Align right" active={editor?.isActive({ textAlign: 'right' })} onClick={() => editor?.chain().focus().setTextAlign('right').run()}><AlignRight /></ToolButton>
        <ToolButton label="Justify" active={editor?.isActive({ textAlign: 'justify' })} onClick={() => editor?.chain().focus().setTextAlign('justify').run()}><AlignJustify /></ToolButton>
        <ToolButton label="Bullet list" active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List /></ToolButton>
        <ToolButton label="Numbered list" active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered /></ToolButton>
      </div>
      <div className="iq-tool-group">
        <ToolButton label="Insert link" onClick={setLink}><Link2 /></ToolButton>
        <ToolButton label="Insert table" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 /></ToolButton>
        <ToolButton label="Insert image" onClick={addImage}><ImagePlus /></ToolButton>
      </div>
    </>
  )

  const insertRibbon = (
    <>
      <div className="iq-tool-group iq-large-tools">
        <ToolButton label="Insert link" onClick={setLink}><Link2 /><span>Link</span></ToolButton>
        <ToolButton label="Insert image" onClick={addImage}><ImagePlus /><span>Image</span></ToolButton>
        <ToolButton label="Insert table" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 /><span>Table</span></ToolButton>
      </div>
    </>
  )

  const fileRibbon = (
    <div className="iq-tool-group iq-large-tools">
      <ToolButton label="Export DOCX" onClick={onExport}><FileDown /><span>Export DOCX</span></ToolButton>
      <ToolButton label="Open full DOCX editor" onClick={onOpenFullEditor}><FilePenLine /><span>Full DOCX</span></ToolButton>
    </div>
  )

  const reviewRibbon = (
    <div className="iq-tool-group iq-large-tools">
      <ToolButton label="Ask IQ to review" onClick={onOpenIQ}><Sparkles /><span>Review with IQ</span></ToolButton>
    </div>
  )

  return (
    <div className="iq-ribbon" onMouseDown={(event) => {
      if ((event.target as HTMLElement).closest('button')) event.preventDefault()
      focus()
    }}>
      <div className="iq-ribbon-tabs" role="tablist" aria-label="Document tools">
        {(['File', 'Home', 'Insert', 'Layout', 'Review'] as RibbonTab[]).map((tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            key={tab}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="iq-ribbon-tools">
        {activeTab === 'Home' && homeRibbon}
        {activeTab === 'Insert' && insertRibbon}
        {activeTab === 'File' && fileRibbon}
        {activeTab === 'Review' && reviewRibbon}
        {activeTab === 'Layout' && (
          <div className="iq-layout-note">A4 · Portrait · Normal margins</div>
        )}
      </div>
    </div>
  )
}

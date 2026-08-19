'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  BookOpen,
  Check,
  Clock3,
  CloudOff,
  FileDown,
  FilePenLine,
  FileSpreadsheet,
  FileText,
  History,
  LoaderCircle,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  PanelRightOpen,
  Presentation,
  Share2,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

import { documentsApi } from '@/lib/api/documents'
import { useIQDocument } from '@/lib/hooks/use-iq-document'
import type { IQEditProposal } from '@/lib/types/documents'
import { DocumentEditor } from './DocumentEditor'
import { DocumentToolbar } from './DocumentToolbar'
import { IQPanel } from './IQPanel'
import { OnlyOfficeEditor } from './OnlyOfficeEditor'
import './documents.css'

type EditorMode = 'native' | 'onlyoffice'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function findTextRange(editor: Editor, target: string) {
  let range: { from: number; to: number } | null = null
  editor.state.doc.descendants((node, position) => {
    if (range || !node.isText || !node.text) return
    const index = node.text.indexOf(target)
    if (index >= 0) range = { from: position + index, to: position + index + target.length }
  })
  return range
}

export function ChatIQDocumentsWorkspace() {
  const {
    document,
    isConnected,
    isLoading,
    saveStatus,
    updateDocument,
    proposeEdit,
    initialProposal,
  } = useIQDocument()
  const [editor, setEditor] = useState<Editor | null>(null)
  const [selectedText, setSelectedText] = useState('')
  const [proposal, setProposal] = useState<IQEditProposal | null>(initialProposal)
  const [isThinking, setIsThinking] = useState(false)
  const [iqOpen, setIqOpen] = useState(true)
  const [mode, setMode] = useState<EditorMode>('native')

  useEffect(() => {
    if (mode === 'onlyoffice') setIqOpen(false)
  }, [mode])

  const wordCount = editor
    ? editor.getText().trim().split(/\s+/).filter(Boolean).length
    : document.word_count

  const handleAsk = useCallback(async (instruction: string) => {
    if (!editor) return
    setIsThinking(true)
    setIqOpen(true)
    try {
      const nextProposal = await proposeEdit(instruction, selectedText, editor.getText())
      setProposal(nextProposal)
    } catch {
      toast.error('IQ could not prepare an edit. Check your model connection and try again.')
    } finally {
      setIsThinking(false)
    }
  }, [editor, proposeEdit, selectedText])

  const applyProposal = useCallback(() => {
    if (!editor || !proposal) return
    const { from, to } = editor.state.selection
    const activeSelection = editor.state.doc.textBetween(from, to, ' ')
    const selectionMatches = activeSelection.trim() === proposal.original.trim() && from !== to
    const range = selectionMatches ? { from, to } : findTextRange(editor, proposal.original)
    if (!range) {
      toast.error('The original passage changed. Ask IQ for a fresh suggestion.')
      return
    }
    editor.chain().focus().insertContentAt(range, proposal.replacement).run()
    setProposal(null)
    setSelectedText('')
    toast.success('IQ edit applied')
  }, [editor, proposal])

  const exportDocument = useCallback(async () => {
    try {
      if (isConnected && document.id !== 'local-preview-document') {
        const blob = await documentsApi.exportDocx(document.id)
        downloadBlob(blob, `${document.title || 'Untitled document'}.docx`)
      } else {
        const blob = new Blob([
          `<!doctype html><html><head><meta charset="utf-8"><title>${document.title}</title></head><body>${document.html}</body></html>`,
        ], { type: 'text/html;charset=utf-8' })
        downloadBlob(blob, `${document.title || 'Untitled document'}.html`)
        toast.info('Offline preview exported as HTML. Connect the API for DOCX export.')
      }
    } catch {
      toast.error('Export failed. Please try again.')
    }
  }, [document.html, document.id, document.title, isConnected])

  const shareDocument = useCallback(async () => {
    const data = { title: document.title, text: `Open “${document.title}” in Chat IQ Documents`, url: window.location.href }
    try {
      if (navigator.share) await navigator.share(data)
      else {
        await navigator.clipboard.writeText(window.location.href)
        toast.success('Document link copied')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      toast.error('Could not share this document')
    }
  }, [document.title])

  const openFullEditor = () => {
    if (!isConnected || document.id === 'local-preview-document') {
      toast.info('Connect the Chat IQ API to use the full DOCX engine.')
      return
    }
    setMode('onlyoffice')
  }

  const statusLabel = saveStatus === 'saving'
    ? 'Saving…'
    : saveStatus === 'unsaved'
      ? 'Unsaved changes'
      : saveStatus === 'offline'
        ? 'Offline preview'
        : saveStatus === 'error'
          ? 'Save failed'
          : 'Saved'

  return (
    <div className="chat-iq-documents">
      <aside className="iq-app-rail" aria-label="Chat IQ applications">
        <Link className="iq-logo" href="/" aria-label="Chat IQ home">IQ</Link>
        <nav>
          <Link href="/documents" className="active" aria-current="page"><FileText /><span>Documents</span></Link>
          <button type="button" onClick={() => toast.info('IQ Sheets is the next office application.')}><FileSpreadsheet /><span>Sheets</span></button>
          <button type="button" onClick={() => toast.info('IQ Slides is planned after Documents.')}><Presentation /><span>Slides</span></button>
          <Link href="/notebooks"><BookOpen /><span>Library</span></Link>
        </nav>
        <button type="button" className="iq-rail-menu" aria-label="Open application menu"><Menu /></button>
      </aside>

      <main className="iq-document-shell">
        <header className="iq-document-header">
          <div className="iq-document-identity">
            <span className="iq-file-icon"><FilePenLine /></span>
            <div>
              <input
                value={document.title}
                onChange={(event) => updateDocument({ title: event.target.value })}
                aria-label="Document title"
              />
              <span className={`iq-save-state status-${saveStatus}`}>
                {saveStatus === 'saving' ? <LoaderCircle className="spin" /> : saveStatus === 'offline' ? <CloudOff /> : <Check />}
                {statusLabel}
              </span>
            </div>
          </div>
          <div className="iq-document-actions">
            {mode === 'onlyoffice' && (
              <button type="button" className="iq-header-button" onClick={() => setMode('native')}>
                <FileText /> Fast editor
              </button>
            )}
            <button type="button" className="iq-icon-button" title="Version history" aria-label="Version history" onClick={() => toast.info(`Version ${document.version} is current`)}><History /></button>
            <button type="button" className="iq-icon-button" title="Comments" aria-label="Comments" onClick={() => { setIqOpen(true); toast.info('Comment threads will appear beside IQ suggestions.') }}><MessageSquareText /></button>
            <button type="button" className="iq-primary-header-button" onClick={() => void shareDocument()}><Share2 /> Share</button>
            <button type="button" className="iq-header-button" onClick={() => void exportDocument()}><FileDown /> Export</button>
            <button type="button" className="iq-icon-button" aria-label="More document actions"><MoreHorizontal /></button>
          </div>
        </header>

        {mode === 'native' ? (
          <DocumentToolbar
            editor={editor}
            onExport={() => void exportDocument()}
            onOpenFullEditor={openFullEditor}
            onOpenIQ={() => setIqOpen(true)}
          />
        ) : (
          <div className="iq-full-mode-bar">
            <span>Full DOCX engine</span>
            <span>High-fidelity pagination, comments, review, headers and footers</span>
          </div>
        )}

        <div className={`iq-document-body ${iqOpen ? 'with-assistant' : ''}`}>
          <section className="iq-canvas" aria-label="Document canvas">
            {isLoading && <div className="iq-loading-banner"><LoaderCircle className="spin" /> Connecting to your document…</div>}
            {mode === 'native' ? (
              <div className="iq-page-wrap">
                <article className="iq-page">
                  <DocumentEditor
                    html={document.html}
                    onChange={(html) => updateDocument({ html })}
                    onEditorReady={setEditor}
                    onSelectionChange={setSelectedText}
                  />
                </article>
              </div>
            ) : (
              <OnlyOfficeEditor documentId={document.id} />
            )}
          </section>

          {iqOpen ? (
            <IQPanel
              proposal={proposal}
              selectedText={selectedText}
              isThinking={isThinking}
              onAsk={handleAsk}
              onApply={applyProposal}
              onDiscard={() => setProposal(null)}
              onClose={() => setIqOpen(false)}
            />
          ) : mode === 'native' ? (
            <button type="button" className="iq-open-panel" onClick={() => setIqOpen(true)}>
              <PanelRightOpen /> <Sparkles /> Open IQ
            </button>
          ) : null}
        </div>

        <footer className="iq-status-bar">
          <span><Clock3 /> Last edit {saveStatus === 'saved' ? 'saved' : statusLabel.toLowerCase()}</span>
          <span>Page 1 of {Math.max(1, Math.ceil(wordCount / 450))}</span>
          <span>{wordCount.toLocaleString()} words</span>
          <span>English (US)</span>
          <span>100%</span>
        </footer>
      </main>
    </div>
  )
}

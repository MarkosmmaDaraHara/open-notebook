'use client'

import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, TriangleAlert } from 'lucide-react'

import { documentsApi } from '@/lib/api/documents'

interface OnlyOfficeEditorProps {
  documentId: string
}

interface DocsEditorInstance {
  destroyEditor: () => void
}

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (elementId: string, config: Record<string, unknown>) => DocsEditorInstance
    }
  }
}

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${url}"]`)
    if (existing) {
      if (window.DocsAPI) resolve()
      else existing.addEventListener('load', () => resolve(), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Unable to load ONLYOFFICE Document Server'))
    document.head.appendChild(script)
  })
}

export function OnlyOfficeEditor({ documentId }: OnlyOfficeEditorProps) {
  const editorRef = useRef<DocsEditorInstance | null>(null)
  const [error, setError] = useState<string | null>(null)
  const containerId = `onlyoffice-${documentId.replace(/[^a-zA-Z0-9_-]/g, '-')}`

  useEffect(() => {
    let cancelled = false
    const start = async () => {
      try {
        const response = await documentsApi.editorConfig(documentId)
        const scriptUrl = `${response.document_server_url.replace(/\/$/, '')}/web-apps/apps/api/documents/api.js`
        await loadScript(scriptUrl)
        if (cancelled || !window.DocsAPI) return
        editorRef.current = new window.DocsAPI.DocEditor(containerId, response.config)
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Full DOCX mode is not configured')
        }
      }
    }
    void start()
    return () => {
      cancelled = true
      editorRef.current?.destroyEditor()
      editorRef.current = null
    }
  }, [containerId, documentId])

  if (error) {
    return (
      <div className="iq-onlyoffice-state">
        <TriangleAlert />
        <h2>Full DOCX mode is unavailable</h2>
        <p>{error}</p>
        <p>Set ONLYOFFICE_DOCUMENT_SERVER_URL on the API server, then reopen this mode.</p>
      </div>
    )
  }

  return (
    <div className="iq-onlyoffice-frame">
      <div className="iq-onlyoffice-loading"><LoaderCircle /> Loading the full DOCX engine…</div>
      <div id={containerId} className="iq-onlyoffice-container" />
    </div>
  )
}

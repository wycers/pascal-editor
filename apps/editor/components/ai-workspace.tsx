'use client'

import { type SceneGraph, useScene } from '@pascal-app/core'
import { applySceneGraphToEditor, useEditor } from '@pascal-app/editor'
import type { LlmToolTraceEntry } from '@pascal-app/mcp/ai'
import { useViewer } from '@pascal-app/viewer'
import { AlertTriangle, Loader2, Sparkles, Square, Trash2, Wrench } from 'lucide-react'
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  type AiChatMessage,
  type AiWorkspaceStatus,
  useAiWorkspaceStore,
} from '@/lib/ai/workspace-store'
import { cn } from '@/lib/utils'

type EditorAiApiResponse = {
  sceneGraph: SceneGraph
  summary: string
  warnings: string[]
  toolTrace: LlmToolTraceEntry[]
  toolCallCount: number
}

type ApiErrorPayload = {
  error?: string
  message?: string
  details?: unknown
}

export function AiWorkspacePanel() {
  const prompt = useAiWorkspaceStore((state) => state.prompt)
  const messages = useAiWorkspaceStore((state) => state.messages)
  const summary = useAiWorkspaceStore((state) => state.summary)
  const warnings = useAiWorkspaceStore((state) => state.warnings)
  const toolTrace = useAiWorkspaceStore((state) => state.toolTrace)
  const error = useAiWorkspaceStore((state) => state.error)
  const status = useAiWorkspaceStore((state) => state.status)
  const setPrompt = useAiWorkspaceStore((state) => state.setPrompt)
  const setRunning = useAiWorkspaceStore((state) => state.setRunning)
  const setResult = useAiWorkspaceStore((state) => state.setResult)
  const setError = useAiWorkspaceStore((state) => state.setError)
  const setCancelled = useAiWorkspaceStore((state) => state.setCancelled)
  const appendMessage = useAiWorkspaceStore((state) => state.appendMessage)
  const clearTranscript = useAiWorkspaceStore((state) => state.clearTranscript)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const sceneNodes = useScene((state) => state.nodes)
  const rootNodeIds = useScene((state) => state.rootNodeIds)
  const selection = useViewer((state) => state.selection)
  const phase = useEditor((state) => state.phase)
  const mode = useEditor((state) => state.mode)
  const tool = useEditor((state) => state.tool)

  const selectedNodeSummaries = useMemo(
    () =>
      selection.selectedIds
        .map((id) => {
          const node = getSceneNode(sceneNodes, id)
          if (!node) return null
          return {
            id,
            type: String((node as { type?: unknown }).type ?? 'unknown'),
            name:
              typeof (node as { name?: unknown }).name === 'string'
                ? (node as { name: string }).name
                : null,
          }
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
    [sceneNodes, selection.selectedIds],
  )

  const rootNodeLabel = useMemo(() => {
    const root = rootNodeIds[0] ? getSceneNode(sceneNodes, rootNodeIds[0]) : null
    return root && typeof (root as { name?: unknown }).name === 'string'
      ? (root as { name: string }).name
      : 'Untitled scene'
  }, [rootNodeIds, sceneNodes])
  const scrollMarker = [
    messages.length,
    summary ?? '',
    warnings.length,
    toolTrace.length,
    error ?? '',
    status,
  ].join(':')

  const handleRun = async () => {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) {
      setError('请输入要执行的编辑指令')
      return
    }

    if (isSubmitting) return

    const controller = new AbortController()
    abortRef.current = controller
    setIsSubmitting(true)
    setRunning()
    appendMessage({
      id: createMessageId(),
      role: 'user',
      content: trimmedPrompt,
    })

    try {
      const response = await fetch('/api/ai/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          projectName: rootNodeLabel,
          sceneGraph: {
            nodes: sceneNodes,
            rootNodeIds,
          },
          selectedNodeIds: selection.selectedIds,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null
        throw new Error(formatApiError(payload, response.status))
      }

      const payload = (await response.json()) as EditorAiApiResponse
      applySceneGraphToEditor(payload.sceneGraph)
      setResult({
        summary: payload.summary,
        warnings: payload.warnings,
        toolTrace: payload.toolTrace,
      })
      appendMessage({
        id: createMessageId(),
        role: 'assistant',
        content: payload.summary,
      })
    } catch (error) {
      if (isAbortError(error)) {
        setCancelled()
        appendMessage({
          id: createMessageId(),
          role: 'system',
          content: '本次 AI 请求已取消。',
        })
        return
      }

      const message = error instanceof Error ? error.message : 'AI 执行失败'
      setError(message)
      appendMessage({
        id: createMessageId(),
        role: 'assistant',
        content: message,
      })
    } finally {
      setIsSubmitting(false)
      abortRef.current = null
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setCancelled()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void handleRun()
    }
  }

  useEffect(() => {
    void scrollMarker
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [scrollMarker])

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-border/50 border-b px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <h2 className="font-semibold text-sm">AI 工作区</h2>
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              当前场景内联编辑，不会切到 demo 生成壳。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={status} />
            <button
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border/70 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
              onClick={clearTranscript}
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
              清空
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-2 border-border/50 border-b px-4 py-3 text-xs">
        <ContextCard label="场景" value={rootNodeLabel} />
        <ContextCard
          label="选择"
          value={selectedNodeSummaries.length ? `${selectedNodeSummaries.length} 个节点` : '未选择'}
        />
        <ContextCard label="编辑状态" value={`${phase}/${mode}${tool ? `/${tool}` : ''}`} />
        <ContextCard label="节点数" value={String(Object.keys(sceneNodes).length)} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        <div className="space-y-3">
          {messages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-4 text-muted-foreground text-sm">
              输入一句编辑指令，例如“补一个会议室并补两扇门”，然后运行。
            </div>
          ) : (
            messages.map((message) => <ChatBubble key={message.id} message={message} />)
          )}

          {summary && (
            <section className="rounded-xl border border-border/70 bg-background/70 p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
                <Wrench className="h-4 w-4 text-sky-400" />
                结果摘要
              </div>
              <p className="whitespace-pre-wrap text-muted-foreground">{summary}</p>
            </section>
          )}

          {warnings.length > 0 && (
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 font-medium text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                结果警告
              </div>
              <ul className="space-y-1 text-amber-100/90 text-xs">
                {warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-foreground text-sm">MCP 工具轨迹</h3>
              <span className="text-muted-foreground text-xs">{toolTrace.length} 条</span>
            </div>
            {toolTrace.length === 0 ? (
              <div className="rounded-xl border border-border/50 bg-background/40 p-3 text-muted-foreground text-xs">
                运行后会显示每次工具调用和返回结果。
              </div>
            ) : (
              <div className="space-y-2">
                {toolTrace.map((entry, index) => (
                  <details
                    className="rounded-xl border border-border/60 bg-background/60 p-3 text-xs"
                    key={`${entry.toolCallId}-${index}`}
                  >
                    <summary className="cursor-pointer list-none font-medium text-foreground">
                      <span className="mr-2 text-muted-foreground">#{entry.iteration + 1}</span>
                      {entry.name}
                      {entry.isError ? (
                        <span className="ml-2 text-destructive">error</span>
                      ) : (
                        <span className="ml-2 text-muted-foreground">ok</span>
                      )}
                    </summary>
                    <div className="mt-2 space-y-2">
                      <TraceBlock label="arguments" value={entry.arguments} />
                      <TraceBlock label="result" value={entry.result} />
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-border/50 border-t p-3">
        <textarea
          className="min-h-[112px] w-full resize-none rounded-xl border border-border/70 bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-sky-500/50"
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="告诉 AI 你要修改什么，例如：补一个会议室并补两扇门"
          value={prompt}
        />
        {error && <p className="mt-2 text-destructive text-xs">{error}</p>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-[11px]">
            `Ctrl` + `Enter` 运行，支持直接修改当前场景。
          </p>
          <div className="flex items-center gap-2">
            {status === 'running' ? (
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm hover:bg-accent/50"
                onClick={handleStop}
                type="button"
              >
                <Square className="h-3.5 w-3.5" />
                停止
              </button>
            ) : (
              <button
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors',
                  isSubmitting || !prompt.trim()
                    ? 'cursor-not-allowed border-border/60 bg-muted/30 text-muted-foreground'
                    : 'border-sky-500/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/15',
                )}
                disabled={isSubmitting || !prompt.trim()}
                onClick={() => void handleRun()}
                type="button"
              >
                {isSubmitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                运行
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ChatBubble({ message }: { message: AiChatMessage }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2 text-sm',
        isUser
          ? 'border-sky-500/20 bg-sky-500/10 text-sky-50'
          : isSystem
            ? 'border-border/60 bg-background/60 text-muted-foreground'
            : 'border-border/60 bg-background/80 text-foreground',
      )}
    >
      <div className="mb-1 font-medium text-[11px] uppercase tracking-wide text-muted-foreground">
        {isUser ? '你' : isSystem ? '系统' : 'AI'}
      </div>
      <p className="whitespace-pre-wrap">{message.content}</p>
    </div>
  )
}

function ContextCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2">
      <div className="text-muted-foreground text-[11px] uppercase tracking-wide">{label}</div>
      <div className="mt-1 truncate text-foreground text-sm">{value}</div>
    </div>
  )
}

function StatusPill({ status }: { status: AiWorkspaceStatus }) {
  const styles: Record<AiWorkspaceStatus, string> = {
    idle: 'border-border/60 bg-background text-muted-foreground',
    running: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    error: 'border-destructive/30 bg-destructive/10 text-destructive',
    cancelled: 'border-border/60 bg-background text-muted-foreground',
  }

  return (
    <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-medium', styles[status])}>
      {status === 'idle'
        ? '待命'
        : status === 'running'
          ? '运行中'
          : status === 'success'
            ? '完成'
            : status === 'cancelled'
              ? '已取消'
              : '错误'}
    </span>
  )
}

function getSceneNode(nodes: SceneGraph['nodes'], id: string): unknown {
  return (nodes as Record<string, unknown>)[id]
}

function TraceBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="space-y-1">
      <div className="font-medium text-muted-foreground text-[11px] uppercase tracking-wide">
        {label}
      </div>
      <pre className="max-h-48 overflow-auto rounded-lg bg-neutral-950/80 p-3 font-mono text-[11px] text-neutral-100">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

function formatApiError(payload: ApiErrorPayload | null, status: number): string {
  if (!payload) {
    return `请求失败 (${status})`
  }

  if (payload.message) {
    return payload.message
  }

  if (payload.error) {
    return payload.error
  }

  return `请求失败 (${status})`
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

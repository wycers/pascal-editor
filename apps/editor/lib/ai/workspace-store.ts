'use client'

import type { LlmToolTraceEntry } from '@pascal-app/mcp/ai'
import { useSyncExternalStore } from 'react'

export type AiChatRole = 'user' | 'assistant' | 'system'

export type AiChatMessage = {
  id: string
  role: AiChatRole
  content: string
}

export type AiWorkspaceStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled'

export type AiWorkspaceState = {
  prompt: string
  messages: AiChatMessage[]
  summary: string | null
  warnings: string[]
  toolTrace: LlmToolTraceEntry[]
  error: string | null
  status: AiWorkspaceStatus
  setPrompt: (prompt: string) => void
  setRunning: () => void
  setResult: (result: {
    summary: string
    warnings: string[]
    toolTrace: LlmToolTraceEntry[]
  }) => void
  setError: (error: string) => void
  setCancelled: () => void
  appendMessage: (message: AiChatMessage) => void
  clearTranscript: () => void
}

type AiWorkspaceData = Omit<
  AiWorkspaceState,
  | 'setPrompt'
  | 'setRunning'
  | 'setResult'
  | 'setError'
  | 'setCancelled'
  | 'appendMessage'
  | 'clearTranscript'
>

type AiWorkspaceSnapshot = AiWorkspaceState
type Listener = () => void

const INITIAL_STATE: AiWorkspaceData = {
  prompt: '',
  messages: [],
  summary: null,
  warnings: [],
  toolTrace: [],
  error: null,
  status: 'idle',
}

let state: AiWorkspaceData = { ...INITIAL_STATE }
const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

function update(mutator: (current: AiWorkspaceData) => AiWorkspaceData): void {
  state = mutator(state)
  snapshot = {
    ...state,
    ...actions,
  }
  emit()
}

const actions = {
  setPrompt(prompt: string): void {
    update((current) => ({
      ...current,
      prompt,
    }))
  },
  setRunning(): void {
    update((current) => ({
      ...current,
      error: null,
      summary: null,
      warnings: [],
      toolTrace: [],
      status: 'running',
    }))
  },
  setResult(result: { summary: string; warnings: string[]; toolTrace: LlmToolTraceEntry[] }): void {
    update((current) => ({
      ...current,
      summary: result.summary,
      warnings: result.warnings,
      toolTrace: result.toolTrace,
      error: null,
      status: 'success',
    }))
  },
  setError(error: string): void {
    update((current) => ({
      ...current,
      error,
      status: 'error',
    }))
  },
  setCancelled(): void {
    update((current) => ({
      ...current,
      error: null,
      status: 'cancelled',
    }))
  },
  appendMessage(message: AiChatMessage): void {
    update((current) => ({
      ...current,
      messages: [...current.messages, message],
    }))
  },
  clearTranscript(): void {
    update((current) => ({
      ...current,
      messages: [],
      summary: null,
      warnings: [],
      toolTrace: [],
      error: null,
      status: 'idle',
    }))
  },
}

let snapshot: AiWorkspaceSnapshot = {
  ...state,
  ...actions,
}

function getSnapshot(): AiWorkspaceSnapshot {
  return snapshot
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useAiWorkspaceStore<T>(selector: (state: AiWorkspaceSnapshot) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getSnapshot()),
    () => selector(getSnapshot()),
  )
}

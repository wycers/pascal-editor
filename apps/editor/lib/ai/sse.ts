import type { EditorAiStreamEvent } from './stream-events'

export type SseMessage = {
  event: string
  data: string
}

export type SseParser = {
  push(chunk: string): SseMessage[]
  flush(): SseMessage[]
}

export function createSseParser(): SseParser {
  let buffer = ''

  return {
    push(chunk: string): SseMessage[] {
      buffer += chunk
      return drainCompleteFrames()
    },
    flush(): SseMessage[] {
      if (!buffer.trim()) {
        buffer = ''
        return []
      }

      const frame = buffer
      buffer = ''
      const message = parseFrame(frame)
      return message ? [message] : []
    },
  }

  function drainCompleteFrames(): SseMessage[] {
    const messages: SseMessage[] = []
    while (true) {
      const delimiterIndex = buffer.indexOf('\n\n')
      if (delimiterIndex === -1) return messages

      const frame = buffer.slice(0, delimiterIndex)
      buffer = buffer.slice(delimiterIndex + 2)
      const message = parseFrame(frame)
      if (message) messages.push(message)
    }
  }
}

export function parseEditorAiSseMessage(message: SseMessage): EditorAiStreamEvent | null {
  if (
    message.event !== 'tool' &&
    message.event !== 'scene' &&
    message.event !== 'final' &&
    message.event !== 'error'
  ) {
    return null
  }

  const parsed = JSON.parse(message.data) as EditorAiStreamEvent
  return parsed.type === message.event ? parsed : null
}

function parseFrame(frame: string): SseMessage | null {
  let event = 'message'
  const data: string[] = []

  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue

    const separatorIndex = line.indexOf(':')
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex)
    const value =
      separatorIndex === -1
        ? ''
        : line.slice(separatorIndex + (line[separatorIndex + 1] === ' ' ? 2 : 1))

    if (field === 'event') {
      event = value
    } else if (field === 'data') {
      data.push(value)
    }
  }

  if (data.length === 0) return null
  return {
    event,
    data: data.join('\n'),
  }
}

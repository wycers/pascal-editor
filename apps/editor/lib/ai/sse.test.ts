import { expect, test } from 'bun:test'
import { createSseParser, parseEditorAiSseMessage } from './sse'

test('parses editor AI SSE events split across chunks', () => {
  const parser = createSseParser()
  const messages = [
    ...parser.push('event: tool\ndata: {"type":"tool","entry":{"iteration":0,'),
    ...parser.push(
      '"toolCallId":"call_1","name":"create_room","arguments":{},"isError":false,"result":{}}}\n\n',
    ),
  ]

  expect(messages).toHaveLength(1)
  expect(messages[0]?.event).toBe('tool')

  const event = parseEditorAiSseMessage(messages[0]!)
  expect(event?.type).toBe('tool')
  expect(event?.type === 'tool' ? event.entry.name : null).toBe('create_room')
})

test('flushes a final unterminated SSE frame', () => {
  const parser = createSseParser()
  expect(parser.push('event: final\ndata: {"type":"final","summary":"done"')).toEqual([])

  const messages = parser.flush()

  expect(messages).toHaveLength(1)
  expect(messages[0]).toEqual({
    event: 'final',
    data: '{"type":"final","summary":"done"',
  })
})

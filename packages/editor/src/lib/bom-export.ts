'use client'

import type { SceneGraph } from './scene'

export async function downloadBomBundle(
  sceneGraph: SceneGraph,
  projectName?: string,
): Promise<void> {
  const response = await fetch('/api/bom/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sceneGraph, projectName }),
  })

  if (!response.ok) {
    let message = `BOM export failed (${response.status})`
    try {
      const body = (await response.json()) as { message?: string; error?: string }
      message = body.message ?? body.error ?? message
    } catch {
      // Keep the status-based fallback.
    }
    throw new Error(message)
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filenameFromDisposition(response.headers.get('content-disposition')) ?? 'bom.zip'
  link.click()
  URL.revokeObjectURL(url)
}

function filenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8?.[1]) return decodeURIComponent(utf8[1])
  const plain = disposition.match(/filename="?([^";]+)"?/i)
  return plain?.[1] ?? null
}

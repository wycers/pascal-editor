'use client'

import type { SceneGraph } from '@pascal-app/editor'
import { AlertTriangle, Download, FileSpreadsheet, Loader2, PackageCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { computeDemoSceneMetrics } from '@/lib/demo-metrics'

interface DemoInfoPanelProps {
  projectName: string
  sceneGraph: SceneGraph
}

export function DemoInfoPanel({ projectName, sceneGraph }: DemoInfoPanelProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const metrics = useMemo(() => computeDemoSceneMetrics(sceneGraph), [sceneGraph])

  const handleExportBom = async () => {
    setIsExporting(true)
    setStatus(null)
    setError(null)
    try {
      const response = await fetch('/api/bom/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneGraph,
          projectName,
        }),
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
      link.download =
        filenameFromDisposition(response.headers.get('content-disposition')) ?? 'modular-bom.zip'
      link.click()
      URL.revokeObjectURL(url)

      const pdfGenerated = response.headers.get('x-bom-pdf-generated') === 'true'
      setStatus(
        pdfGenerated
          ? 'BOM ZIP 已导出，包含 Excel 与 PDF。'
          : 'BOM ZIP 已导出，Excel 可用；PDF 生成器不可用时已降级。',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'BOM export failed')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <aside className="pointer-events-auto w-[340px] max-w-[calc(100vw-2rem)] rounded-lg border border-border/70 bg-background/95 p-3 text-foreground shadow-xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
            方案演示
          </p>
          <h2 className="mt-1 line-clamp-2 font-semibold text-sm">{projectName}</h2>
        </div>
        <PackageCheck className="mt-0.5 h-5 w-5 text-emerald-400" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Metric label="建筑面积" value={`${metrics.floorAreaSqMeters.toFixed(0)} m2`} />
        <Metric label="房间/区域" value={String(metrics.roomCount)} />
        <Metric label="结构节点" value={String(metrics.sourceNodeCount)} />
        <Metric label="BOM 条目" value={String(metrics.bomSummaryRowCount)} />
      </div>

      <div className="mt-3 rounded-md border border-emerald-500/25 bg-emerald-500/10 p-2 text-[11px] text-emerald-100 leading-relaxed">
        标准模块化构件规则已接入：墙板、龙骨、保温、楼板、吊顶、门窗、屋面、楼梯和设备类构件可进入 BOM。
      </div>

      <button
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-accent px-3 py-2 font-medium text-sm hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isExporting || metrics.sourceNodeCount === 0}
        onClick={handleExportBom}
        type="button"
      >
        {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        导出 BOM ZIP
      </button>

      {status && (
        <p className="mt-2 flex items-start gap-2 text-[11px] text-muted-foreground">
          <FileSpreadsheet className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {status}
        </p>
      )}
      {error && (
        <p className="mt-2 flex items-start gap-2 text-[11px] text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </aside>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/70 px-2 py-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-sm">{value}</p>
    </div>
  )
}

function filenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8?.[1]) return decodeURIComponent(utf8[1])
  const plain = disposition.match(/filename="?([^";]+)"?/i)
  return plain?.[1] ?? null
}

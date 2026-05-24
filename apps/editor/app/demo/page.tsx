'use client'

import {
  ArrowRight,
  Building2,
  FileSpreadsheet,
  Loader2,
  PackageCheck,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const PRESETS = [
  {
    id: 'office',
    label: '两层模块化办公楼',
    projectName: '两层模块化办公楼 Demo',
    brief:
      '生成一个两层模块化办公建筑，约 300 平米，包含 6 个办公室、1 个会议室、开放工位、2 个卫生间、楼梯和屋面，尽量使用标准模块化构件。',
  },
  {
    id: 'lodging',
    label: '模块化民宿/宿舍楼',
    projectName: '模块化民宿 Demo',
    brief:
      '生成一个两层模块化民宿建筑，包含 6 间客房、接待区、餐饮休息区、后勤空间、楼梯、屋面和可复用客房模块。',
  },
]

type GenerateResponse = {
  editorUrl: string
  sceneId: string
  nodeCount: number
  roomCount: number
  limitations: string[]
}

export default function DemoPage() {
  const router = useRouter()
  const [brief, setBrief] = useState(PRESETS[0]!.brief)
  const [projectName, setProjectName] = useState(PRESETS[0]!.projectName)
  const [constraints, setConstraints] = useState('优先使用标准墙板、门窗、楼梯和屋面模块；输出可用于 BOM 估算。')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    setIsGenerating(true)
    setError(null)
    try {
      const response = await fetch('/api/demo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, projectName, constraints }),
      })
      if (!response.ok) {
        let message = `生成失败 (${response.status})`
        try {
          const body = (await response.json()) as { message?: string; error?: string }
          message = body.message ?? body.error ?? message
        } catch {
          // Keep status fallback.
        }
        throw new Error(message)
      }
      const payload = (await response.json()) as GenerateResponse
      router.push(payload.editorUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5">
        <header className="flex items-center justify-between gap-4 border-border border-b pb-4">
          <Link className="text-muted-foreground text-sm hover:text-foreground" href="/">
            Pascal Editor
          </Link>
          <Link
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 font-medium text-sm hover:bg-accent/40"
            href="/scenes"
          >
            已保存场景
            <ArrowRight className="h-4 w-4" />
          </Link>
        </header>

        <section className="grid min-h-0 flex-1 gap-8 py-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col justify-center">
            <p className="inline-flex w-fit items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-200 text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              模块化建筑 AI 方案演示
            </p>
            <h1 className="mt-5 max-w-3xl font-semibold text-4xl leading-tight tracking-normal md:text-5xl">
              从一句客户需求，到可编辑 3D 模型，再到 BOM 清单。
            </h1>
            <p className="mt-5 max-w-2xl text-muted-foreground text-base leading-7">
              这个 Demo 展示的是销售和方案阶段的闭环：AI brief 生成结构化 Pascal
              场景，老板可以现场看模型、改方案，并导出墙板、门窗、楼板、屋面和楼梯等模块化 BOM。
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <ValuePoint icon={<Building2 className="h-4 w-4" />} label="结构化模型" />
              <ValuePoint icon={<PackageCheck className="h-4 w-4" />} label="标准模块语义" />
              <ValuePoint icon={<FileSpreadsheet className="h-4 w-4" />} label="BOM ZIP 导出" />
            </div>
          </div>

          <div className="self-center rounded-lg border border-border bg-sidebar p-4 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-lg">生成演示场景</h2>
                <p className="mt-1 text-muted-foreground text-sm">
                  选择预设或直接改 brief，生成后进入编辑器。
                </p>
              </div>
              <Sparkles className="h-5 w-5 text-emerald-300" />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  className="rounded-md border border-border bg-background px-3 py-1.5 font-medium text-xs hover:bg-accent/40"
                  key={preset.id}
                  onClick={() => {
                    setBrief(preset.brief)
                    setProjectName(preset.projectName)
                  }}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <label className="mt-4 block">
              <span className="font-medium text-sm">项目名称</span>
              <input
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-emerald-400"
                onChange={(event) => setProjectName(event.target.value)}
                value={projectName}
              />
            </label>

            <label className="mt-4 block">
              <span className="font-medium text-sm">AI brief</span>
              <textarea
                className="mt-2 min-h-36 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-emerald-400"
                onChange={(event) => setBrief(event.target.value)}
                value={brief}
              />
            </label>

            <label className="mt-4 block">
              <span className="font-medium text-sm">约束说明</span>
              <textarea
                className="mt-2 min-h-20 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-emerald-400"
                onChange={(event) => setConstraints(event.target.value)}
                value={constraints}
              />
            </label>

            {error && <p className="mt-3 text-destructive text-sm">{error}</p>}

            <button
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-2.5 font-semibold text-background text-sm hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isGenerating || brief.trim().length === 0}
              onClick={generate}
              type="button"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isGenerating ? '正在生成场景...' : '生成并打开 3D Demo'}
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}

function ValuePoint({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-sidebar px-3 py-2 text-sm">
      {icon}
      <span>{label}</span>
    </div>
  )
}

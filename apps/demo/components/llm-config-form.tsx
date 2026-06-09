'use client'

import { KeyRound, Loader2, RefreshCw, Save, Settings2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type Provider = 'openai' | 'deepseek'

type PublicLlmConfig = {
  enabled: boolean
  provider: Provider
  model: string
  baseUrl: string | null
  apiKeyEnvVar: string
  temperature: number
  maxToolIterations: number
  fallbackOnError: boolean
  apiKeyConfigured: boolean
  updatedAt?: string
}

const DEFAULT_CONFIG: PublicLlmConfig = {
  enabled: false,
  provider: 'deepseek',
  model: 'deepseek-v4-pro',
  baseUrl: null,
  apiKeyEnvVar: 'DEEPSEEK_API_KEY',
  temperature: 0.2,
  maxToolIterations: 12,
  fallbackOnError: true,
  apiKeyConfigured: false,
}

const PROVIDER_PRESETS: Record<
  Provider,
  Pick<PublicLlmConfig, 'model' | 'apiKeyEnvVar' | 'baseUrl'>
> = {
  deepseek: {
    model: 'deepseek-v4-pro',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com',
  },
  openai: {
    model: 'gpt-5.5',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    baseUrl: null,
  },
}

export function LlmConfigForm() {
  const [token, setToken] = useState('')
  const [config, setConfig] = useState<PublicLlmConfig>(DEFAULT_CONFIG)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const saved = window.sessionStorage.getItem('pascal-demo-admin-token')
    if (saved) setToken(saved)
  }, [])

  const canSubmit = useMemo(
    () => token.trim().length > 0 && config.model.trim().length > 0,
    [token, config.model],
  )

  const loadConfig = async () => {
    setIsLoading(true)
    setError(null)
    setStatus(null)
    try {
      const response = await fetch('/api/admin/llm-config', {
        headers: adminHeaders(token),
      })
      if (!response.ok) throw new Error(await responseMessage(response, '加载失败'))
      const body = (await response.json()) as { config: PublicLlmConfig }
      setConfig({ ...DEFAULT_CONFIG, ...body.config })
      window.sessionStorage.setItem('pascal-demo-admin-token', token)
      setStatus('配置已加载')
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setIsLoading(false)
    }
  }

  const saveConfig = async () => {
    setIsLoading(true)
    setError(null)
    setStatus(null)
    try {
      const payload = {
        enabled: config.enabled,
        provider: config.provider,
        model: config.model,
        baseUrl: config.baseUrl,
        apiKeyEnvVar: config.apiKeyEnvVar,
        temperature: config.temperature,
        maxToolIterations: config.maxToolIterations,
        fallbackOnError: config.fallbackOnError,
      }
      const response = await fetch('/api/admin/llm-config', {
        method: 'PUT',
        headers: {
          ...adminHeaders(token),
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(await responseMessage(response, '保存失败'))
      const body = (await response.json()) as { config: PublicLlmConfig }
      setConfig({ ...DEFAULT_CONFIG, ...body.config })
      window.sessionStorage.setItem('pascal-demo-admin-token', token)
      setStatus('配置已保存')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setIsLoading(false)
    }
  }

  const applyProviderPreset = (provider: Provider) => {
    const preset = PROVIDER_PRESETS[provider]
    setConfig((current) => ({
      ...current,
      provider,
      model: preset.model,
      apiKeyEnvVar: preset.apiKeyEnvVar,
      baseUrl: preset.baseUrl,
    }))
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
      <section className="rounded-lg border border-border bg-sidebar p-4 shadow-xl">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-emerald-300" />
          <h2 className="font-semibold text-base">Admin token</h2>
        </div>
        <input
          className="mt-4 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-emerald-400"
          onChange={(event) => setToken(event.target.value)}
          placeholder="PASCAL_DEMO_ADMIN_TOKEN"
          type="password"
          value={token}
        />
        <button
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 font-medium text-sm hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canSubmit || isLoading}
          onClick={loadConfig}
          type="button"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Load
        </button>
      </section>

      <section className="rounded-lg border border-border bg-sidebar p-4 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-emerald-300" />
            <h2 className="font-semibold text-base">LLM generator</h2>
          </div>
          <span
            className={`rounded-md border px-2 py-1 font-medium text-xs ${
              config.apiKeyConfigured
                ? 'border-emerald-400/50 text-emerald-300'
                : 'border-amber-400/50 text-amber-300'
            }`}
          >
            {config.apiKeyConfigured ? 'Key configured' : 'Key missing'}
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
            <input
              checked={config.enabled}
              onChange={(event) =>
                setConfig((current) => ({ ...current, enabled: event.target.checked }))
              }
              type="checkbox"
            />
            Enabled
          </label>
          <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
            <input
              checked={config.fallbackOnError}
              onChange={(event) =>
                setConfig((current) => ({ ...current, fallbackOnError: event.target.checked }))
              }
              type="checkbox"
            />
            Fallback
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="font-medium text-sm">Provider</span>
            <select
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-emerald-400"
              onChange={(event) => applyProviderPreset(event.target.value as Provider)}
              value={config.provider}
            >
              <option value="deepseek">DeepSeek</option>
              <option value="openai">OpenAI</option>
            </select>
          </label>
          <label className="block">
            <span className="font-medium text-sm">Model</span>
            <input
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-emerald-400"
              onChange={(event) =>
                setConfig((current) => ({ ...current, model: event.target.value }))
              }
              value={config.model}
            />
          </label>
        </div>

        <label className="mt-4 block">
          <span className="font-medium text-sm">Base URL</span>
          <input
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-emerald-400"
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                baseUrl: event.target.value.trim().length > 0 ? event.target.value : null,
              }))
            }
            placeholder="Provider default"
            value={config.baseUrl ?? ''}
          />
        </label>

        <label className="mt-4 block">
          <span className="font-medium text-sm">API key env var</span>
          <input
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-emerald-400"
            onChange={(event) =>
              setConfig((current) => ({ ...current, apiKeyEnvVar: event.target.value }))
            }
            value={config.apiKeyEnvVar}
          />
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="font-medium text-sm">Temperature</span>
            <input
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-emerald-400"
              max={2}
              min={0}
              onChange={(event) =>
                setConfig((current) => ({ ...current, temperature: Number(event.target.value) }))
              }
              step={0.1}
              type="number"
              value={config.temperature}
            />
          </label>
          <label className="block">
            <span className="font-medium text-sm">Tool iterations</span>
            <input
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-emerald-400"
              max={30}
              min={1}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  maxToolIterations: Number(event.target.value),
                }))
              }
              type="number"
              value={config.maxToolIterations}
            />
          </label>
        </div>

        {error && <p className="mt-4 text-destructive text-sm">{error}</p>}
        {status && <p className="mt-4 text-emerald-300 text-sm">{status}</p>}

        <button
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-2.5 font-semibold text-background text-sm hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canSubmit || isLoading}
          onClick={saveConfig}
          type="button"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save config
        </button>
      </section>
    </div>
  )
}

function adminHeaders(token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
  }
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; message?: string }
    return body.message ?? body.error ?? `${fallback} (${response.status})`
  } catch {
    return `${fallback} (${response.status})`
  }
}

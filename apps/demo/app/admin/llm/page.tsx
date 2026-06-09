import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { LlmConfigForm } from '@/components/llm-config-form'

export const dynamic = 'force-dynamic'

export default function LlmAdminPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-5 py-5">
        <header className="flex items-center justify-between gap-4 border-border border-b pb-4">
          <Link
            className="inline-flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground"
            href="/"
          >
            <ArrowLeft className="h-4 w-4" />
            Pascal Demo
          </Link>
          <span className="font-mono text-muted-foreground text-xs">/admin/llm</span>
        </header>

        <section className="py-8">
          <div className="mb-5">
            <h1 className="font-semibold text-3xl tracking-normal">LLM configuration</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
              Configure the provider used by the demo scene generator.
            </p>
          </div>
          <LlmConfigForm />
        </section>
      </div>
    </main>
  )
}

'use client'

import { Editor, ItemsPanel, type SidebarTab, useEditor, useSidebarStore } from '@pascal-app/editor'
import { Layers, Package, Settings, Sparkles } from 'lucide-react'
import Link from 'next/link'
import type { ComponentType } from 'react'
import { AiWorkspacePanel } from '@/components/ai-workspace'
import {
  CommunityViewerToolbarLeft,
  CommunityViewerToolbarRight,
} from '@/components/viewer-toolbar'

const SIDEBAR_TABS: (SidebarTab & { component: ComponentType })[] = [
  {
    id: 'site',
    label: 'Scene',
    component: () => null,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Layers className="h-5 w-5" />,
  },
  {
    id: 'items',
    label: 'Items',
    component: ItemsPanel,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Package className="h-5 w-5" />,
  },
  {
    id: 'ai',
    label: 'AI',
    component: AiWorkspacePanel,
    mobileDefaultSnap: 0.6,
    mobileIcon: <Sparkles className="h-5 w-5" />,
  },
  {
    id: 'settings',
    label: 'Settings',
    component: () => null,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Settings className="h-5 w-5" />,
  },
]

const PROJECT_ID = 'local-editor'

function openAiWorkspace() {
  useSidebarStore.getState().setIsCollapsed(false)
  useEditor.getState().setActiveSidebarPanel('ai')
}

export default function Home() {
  return (
    <div className="relative h-screen w-screen">
      {PROJECT_ID === 'local-editor' && (
        <div className="pointer-events-none absolute top-3 left-1/2 z-40 -translate-x-1/2">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border/60 bg-background/90 px-4 py-1.5 text-xs shadow-sm backdrop-blur">
            <span className="text-muted-foreground">Local editor — scenes are not saved.</span>
            <Link className="font-medium text-foreground hover:underline" href="/scenes">
              Open recent scenes
            </Link>
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
            <Link className="font-medium text-foreground hover:underline" href="/scenes">
              Create new
            </Link>
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
            <Link
              className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
              href="/demo"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI 方案工作台
            </Link>
            <button
              className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-sky-200 transition-colors hover:bg-sky-500/15"
              onClick={openAiWorkspace}
              type="button"
            >
              <Sparkles className="h-3.5 w-3.5" />
              打开 AI 工作区
            </button>
          </div>
        </div>
      )}
      <Editor
        layoutVersion="v2"
        projectId={PROJECT_ID}
        sidebarTabs={SIDEBAR_TABS}
        viewerToolbarLeft={<CommunityViewerToolbarLeft />}
        viewerToolbarRight={<CommunityViewerToolbarRight />}
      />
    </div>
  )
}

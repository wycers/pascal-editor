import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import {
  type BomRules,
  type BomSceneGraph,
  generateBom,
  renderBomCsv,
  renderBomJson,
  renderFloorplanSvg,
} from '@pascal-app/core'
import { type ArchiveFile, createZipArchive } from './archive'
import { renderBomTypstReport } from './typst-report'
import { renderBomXlsx } from './xlsx'

const execFileAsync = promisify(execFile)
const SUMMARY_CSV_HEADERS = ['sku', 'category', 'name', 'spec', 'unit', 'quantity', 'sourceCount']
const DETAIL_CSV_HEADERS = [
  'sourceNodeId',
  'sourceNodeType',
  'levelId',
  'levelName',
  'sku',
  'category',
  'name',
  'spec',
  'unit',
  'baseQuantity',
  'multiplier',
  'wastePercent',
  'quantity',
  'formula',
  'ruleId',
  'dimensions',
]
const EXCEPTION_CSV_HEADERS = ['severity', 'nodeId', 'nodeType', 'reason', 'detail']

export type BomExportBundle = {
  filename: string
  contentType: 'application/zip'
  bytes: Uint8Array
  files: ArchiveFile[]
  pdfGenerated: boolean
  pdfWarning?: string
}

export async function buildBomExportBundle(input: {
  sceneGraph: BomSceneGraph
  rules: BomRules
  projectName?: string
  now?: Date
  typstBin?: string | null
}): Promise<BomExportBundle> {
  const now = input.now ?? new Date()
  const projectName = input.projectName?.trim() || 'Modular House'
  const result = generateBom(input.sceneGraph, input.rules, { generatedAt: now })
  const floorplans = renderFloorplanSvg(input.sceneGraph)
  const reportTyp = renderBomTypstReport({ result, floorplans, projectName })

  const files: ArchiveFile[] = [
    {
      path: 'bom-summary.csv',
      data: renderBomCsv(
        result.summaryRows as unknown as Array<Record<string, unknown>>,
        SUMMARY_CSV_HEADERS,
      ),
    },
    {
      path: 'bom-detail.csv',
      data: renderBomCsv(
        result.detailRows as unknown as Array<Record<string, unknown>>,
        DETAIL_CSV_HEADERS,
      ),
    },
    {
      path: 'bom-exceptions.csv',
      data: renderBomCsv(
        result.exceptionRows as unknown as Array<Record<string, unknown>>,
        EXCEPTION_CSV_HEADERS,
      ),
    },
    { path: 'bom.json', data: renderBomJson(result) },
    { path: 'bom.xlsx', data: renderBomXlsx(result, now) },
    { path: 'report.typ', data: reportTyp },
    ...floorplans.map((floorplan) => ({
      path: floorplan.filename,
      data: floorplan.svg,
    })),
  ]

  let pdfGenerated = false
  let pdfWarning: string | undefined
  const typstBin = await resolveTypstBin(input.typstBin)

  if (typstBin) {
    const compiled = await compileTypstReport({
      typstBin,
      reportTyp,
      floorplans,
    })
    if (compiled.pdf) {
      files.push({ path: 'report.pdf', data: compiled.pdf })
      pdfGenerated = true
    } else {
      pdfWarning = compiled.warning
      files.push({ path: 'pdf-warning.txt', data: pdfWarning })
    }
  } else {
    pdfWarning =
      'Typst was not found. Set TYPST_BIN or install typst on PATH to include report.pdf in this export.'
    files.push({ path: 'pdf-warning.txt', data: pdfWarning })
  }

  return {
    filename: `bom_${slug(projectName)}_${dateStamp(now)}.zip`,
    contentType: 'application/zip',
    bytes: createZipArchive(files, now),
    files,
    pdfGenerated,
    ...(pdfWarning && { pdfWarning }),
  }
}

async function resolveTypstBin(explicit: string | null | undefined): Promise<string | null> {
  if (explicit === null) return null
  if (explicit && (await canAccess(explicit))) return explicit
  const fromEnv = process.env.TYPST_BIN
  if (fromEnv && (await canAccess(fromEnv))) return fromEnv

  const pathEntries = (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':')
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']
  for (const entry of pathEntries) {
    for (const ext of extensions) {
      const candidate = join(entry, `typst${ext}`)
      if (await canAccess(candidate)) return candidate
    }
  }
  return null
}

async function compileTypstReport(input: {
  typstBin: string
  reportTyp: string
  floorplans: { filename: string; svg: string }[]
}): Promise<{ pdf: Uint8Array | null; warning: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'pascal-bom-'))
  try {
    await writeFile(join(dir, 'report.typ'), input.reportTyp)
    for (const floorplan of input.floorplans) {
      await writeFile(join(dir, basename(floorplan.filename)), floorplan.svg)
    }

    await execFileAsync(input.typstBin, ['compile', 'report.typ', 'report.pdf'], {
      cwd: dir,
      timeout: 30_000,
    })
    return {
      pdf: await readFile(join(dir, 'report.pdf')),
      warning: '',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown Typst failure'
    return {
      pdf: null,
      warning: `Typst PDF generation failed: ${message}`,
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function canAccess(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function dateStamp(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function slug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'bom'
}

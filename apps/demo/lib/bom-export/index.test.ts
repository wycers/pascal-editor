import { expect, test } from 'bun:test'
import type { BomSceneGraph } from '../../../../packages/core/src/bom'
import { type BomRules, BomRulesSchema, generateBom } from '../../../../packages/core/src/bom'
import { buildBomExportBundle } from './index'
import { renderBomXlsx } from './xlsx'

test('renders XLSX worksheets with expected row counts', () => {
  const result = generateBom(testScene(), testRules(), {
    generatedAt: new Date('2026-01-02T03:04:05Z'),
  })
  const xlsx = renderBomXlsx(result, new Date('2026-01-02T03:04:05Z'))
  const xlsxText = Buffer.from(xlsx).toString('utf8')
  const rowCount = xlsxText.match(/<row r="/g)?.length ?? 0
  const expectedExceptionRows =
    result.exceptionRows.length > 0 ? result.exceptionRows.length + 1 : 2
  const expectedRows =
    result.summaryRows.length +
    1 +
    result.detailRows.length +
    1 +
    expectedExceptionRows +
    Object.keys(result.metrics).length +
    1

  expect(xlsxText).toContain('xl/worksheets/sheet1.xml')
  expect(xlsxText).toContain('xl/worksheets/sheet4.xml')
  expect(rowCount).toBe(expectedRows)
})

test('builds a BOM ZIP bundle with Typst fallback warning', async () => {
  const bundle = await buildBomExportBundle({
    sceneGraph: testScene(),
    rules: testRules(),
    projectName: 'Route Module',
    now: new Date('2026-01-02T03:04:05Z'),
    typstBin: null,
  })
  const paths = bundle.files.map((file) => file.path)
  const zipText = Buffer.from(bundle.bytes).toString('utf8')

  expect(bundle.filename).toBe('bom_route-module_2026-01-02.zip')
  expect(bundle.contentType).toBe('application/zip')
  expect(bundle.pdfGenerated).toBe(false)
  expect(paths).toContain('bom-summary.csv')
  expect(paths).toContain('bom-detail.csv')
  expect(paths).toContain('bom-exceptions.csv')
  expect(paths).toContain('bom.xlsx')
  expect(paths).toContain('bom.json')
  expect(paths).toContain('report.typ')
  expect(paths).toContain('floorplan-level-1.svg')
  expect(paths).toContain('pdf-warning.txt')
  expect(Buffer.from(bundle.bytes).subarray(0, 2).toString('utf8')).toBe('PK')
  expect(zipText).toContain('pdf-warning.txt')
})

function testScene(): BomSceneGraph {
  return {
    nodes: {
      building_1: {
        object: 'node',
        id: 'building_1',
        type: 'building',
        parentId: null,
        children: ['level_1'],
        position: [0, 0, 0],
        rotation: [0, 0, 0],
      },
      level_1: {
        object: 'node',
        id: 'level_1',
        type: 'level',
        parentId: 'building_1',
        name: 'Ground',
        level: 0,
        children: ['wall_1'],
      },
      wall_1: {
        object: 'node',
        id: 'wall_1',
        type: 'wall',
        parentId: 'level_1',
        children: [],
        start: [0, 0],
        end: [3, 0],
        height: 2.8,
        thickness: 0.12,
      },
    },
    rootNodeIds: ['building_1'],
  }
}

function testRules(): BomRules {
  return BomRulesSchema.parse({
    version: 1,
    rules: [
      {
        id: 'wall-area',
        sku: 'WALL-AREA',
        name: 'Wall area',
        category: 'Wall',
        unit: 'm2',
        match: { nodeTypes: ['wall'] },
        quantityMethod: 'wall_net_area',
      },
    ],
  })
}

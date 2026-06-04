import { afterEach, expect, test } from 'bun:test'
import { POST } from './route'

const OLD_ENV = { ...process.env }

afterEach(() => {
  restoreEnv('PASCAL_SCENE_API_TOKEN')
  restoreEnv('PASCAL_SCENE_API_RATE_LIMIT')
  restoreEnv('PATH')
  restoreEnv('TYPST_BIN')
})

test('POST /api/bom/export returns a ZIP with a PDF warning when Typst is unavailable', async () => {
  delete process.env.PASCAL_SCENE_API_TOKEN
  process.env.PASCAL_SCENE_API_RATE_LIMIT = '0'
  process.env.PATH = ''
  process.env.TYPST_BIN = 'Z:\\missing\\typst.exe'

  const response = await POST(
    new Request('http://127.0.0.1:3000/api/bom/export', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: '127.0.0.1:3000',
      },
      body: JSON.stringify({
        projectName: 'Route Module',
        sceneGraph: {
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
        },
      }),
    }),
  )
  const zip = Buffer.from(await response.arrayBuffer())
  const zipText = zip.toString('utf8')

  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('application/zip')
  expect(response.headers.get('x-bom-pdf-generated')).toBe('false')
  expect(zip.subarray(0, 2).toString('utf8')).toBe('PK')
  expect(zipText).toContain('bom-summary.csv')
  expect(zipText).toContain('report.typ')
  expect(zipText).toContain('pdf-warning.txt')
})

function restoreEnv(key: keyof NodeJS.ProcessEnv): void {
  if (OLD_ENV[key] === undefined) delete process.env[key]
  else process.env[key] = OLD_ENV[key]
}

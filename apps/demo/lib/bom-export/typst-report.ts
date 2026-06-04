import type { BomResult, FloorplanSvg } from '@pascal-app/core'

export function renderBomTypstReport(input: {
  result: BomResult
  floorplans: FloorplanSvg[]
  projectName: string
}): string {
  const { result, floorplans, projectName } = input
  const summaryRows = result.summaryRows.slice(0, 80)
  const exceptionRows = result.exceptionRows.slice(0, 80)

  return [
    '#set page(margin: 18mm)',
    '#set text(font: "New Computer Modern", size: 10pt)',
    '#set table(stroke: 0.4pt + rgb("#d1d5db"), inset: 5pt)',
    '',
    `= ${escapeTypstText(projectName)} BOM Report`,
    '',
    `Generated: ${escapeTypstText(result.metrics.generatedAt)}`,
    '',
    '== Metrics',
    '',
    metricList(result),
    '',
    '== Summary BOM',
    '',
    table(
      ['SKU', 'Name', 'Spec', 'Qty', 'Unit'],
      summaryRows.map((row) => [row.sku, row.name, row.spec, formatNumber(row.quantity), row.unit]),
    ),
    '',
    '== Exceptions',
    '',
    exceptionRows.length > 0
      ? table(
          ['Severity', 'Node', 'Reason', 'Detail'],
          exceptionRows.map((row) => [
            row.severity,
            `${row.nodeType} ${row.nodeId}`,
            row.reason,
            row.detail,
          ]),
        )
      : 'No exceptions were reported.',
    '',
    '== Floorplans',
    '',
    floorplans.length > 0
      ? floorplans
          .map(
            (floorplan) =>
              `=== ${escapeTypstText(floorplan.levelName)}\n#image("${escapeTypstString(floorplan.filename)}", width: 100%)`,
          )
          .join('\n\n')
      : 'No level floorplans were generated.',
    '',
  ].join('\n')
}

function metricList(result: BomResult): string {
  return [
    `- Source nodes: ${result.metrics.sourceNodeCount}`,
    `- Matched nodes: ${result.metrics.matchedNodeCount}`,
    `- Summary rows: ${result.metrics.summaryRowCount}`,
    `- Detail rows: ${result.metrics.detailRowCount}`,
    `- Exceptions: ${result.metrics.exceptionCount}`,
    `- Total wall length: ${formatNumber(result.metrics.totalWallLengthMeters)} m`,
    `- Total net wall area: ${formatNumber(result.metrics.totalNetWallAreaSqMeters)} m2`,
    `- Total floor area: ${formatNumber(result.metrics.totalFloorAreaSqMeters)} m2`,
  ].join('\n')
}

function table(headers: string[], rows: string[][]): string {
  const columns = `(${headers.map(() => 'auto').join(', ')})`
  const cells = [
    `table.header(${headers.map((header) => cell(header)).join(', ')})`,
    ...rows.flatMap((row) => row.map((value) => cell(value))),
  ]
  return `#table(columns: ${columns},\n${cells.map((entry) => `  ${entry}`).join(',\n')}\n)`
}

function cell(value: string): string {
  return `[${escapeTypstText(value)}]`
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function escapeTypstText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll('#', '\\#')
}

function escapeTypstString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

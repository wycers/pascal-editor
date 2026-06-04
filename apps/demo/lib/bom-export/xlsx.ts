import type { BomDetailRow, BomExceptionRow, BomResult, BomSummaryRow } from '@pascal-app/core'
import { createZipArchive } from './archive'

type Sheet = {
  name: string
  rows: Array<Record<string, unknown>>
}

export function renderBomXlsx(result: BomResult, date = new Date()): Uint8Array {
  const sheets: Sheet[] = [
    { name: 'Summary', rows: result.summaryRows },
    { name: 'Detail', rows: result.detailRows },
    { name: 'Exceptions', rows: result.exceptionRows },
    { name: 'Metrics', rows: metricsRows(result) },
  ]

  const files = [
    { path: '[Content_Types].xml', data: contentTypesXml(sheets.length) },
    { path: '_rels/.rels', data: rootRelsXml() },
    { path: 'xl/workbook.xml', data: workbookXml(sheets) },
    { path: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml(sheets.length) },
    { path: 'xl/styles.xml', data: stylesXml() },
    ...sheets.map((sheet, index) => ({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      data: worksheetXml(sheet.rows),
    })),
  ]

  return createZipArchive(files, date)
}

function metricsRows(result: BomResult): Array<Record<string, unknown>> {
  return Object.entries(result.metrics).map(([metric, value]) => ({ metric, value }))
}

function contentTypesXml(sheetCount: number): string {
  const sheetOverrides = Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('')

  return xml(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
      ${sheetOverrides}
    </Types>`,
  )
}

function rootRelsXml(): string {
  return xml(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
    </Relationships>`,
  )
}

function workbookXml(sheets: Sheet[]): string {
  const entries = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join('')

  return xml(
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <sheets>${entries}</sheets>
    </workbook>`,
  )
}

function workbookRelsXml(sheetCount: number): string {
  const sheetRels = Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join('')

  return xml(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      ${sheetRels}
      <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
    </Relationships>`,
  )
}

function stylesXml(): string {
  return xml(
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
      <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
      <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
      <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
      <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
      <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
    </styleSheet>`,
  )
}

function worksheetXml(rows: Array<Record<string, unknown>>): string {
  const headers = rows.length > 0 ? Object.keys(rows[0]!) : ['message']
  const bodyRows = rows.length > 0 ? rows : [{ message: 'No rows' }]
  const xmlRows = [
    rowXml(headers, 1, true),
    ...bodyRows.map((row, index) =>
      rowXml(
        headers.map((header) => row[header]),
        index + 2,
        false,
      ),
    ),
  ].join('')

  return xml(
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetData>${xmlRows}</sheetData>
    </worksheet>`,
  )
}

function rowXml(values: unknown[], rowIndex: number, isHeader: boolean): string {
  const cells = values
    .map((value, colIndex) => {
      const ref = `${columnName(colIndex + 1)}${rowIndex}`
      if (typeof value === 'number' && Number.isFinite(value) && !isHeader) {
        return `<c r="${ref}"><v>${value}</v></c>`
      }
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`
    })
    .join('')
  return `<row r="${rowIndex}">${cells}</row>`
}

function columnName(index: number): string {
  let n = index
  let name = ''
  while (n > 0) {
    const mod = (n - 1) % 26
    name = String.fromCharCode(65 + mod) + name
    n = Math.floor((n - mod) / 26)
  }
  return name
}

function xml(value: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${value.replace(/\s{2,}/g, ' ').trim()}`
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export type { BomDetailRow, BomExceptionRow, BomSummaryRow }

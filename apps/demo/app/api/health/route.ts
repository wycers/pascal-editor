export function GET() {
  return Response.json({ status: 'ok', app: 'demo', timestamp: new Date().toISOString() })
}

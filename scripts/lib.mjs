// Shared helpers: env, an authenticated fetch against Monospace, schema lookups.
import { loadEnvFile } from 'node:process'

try {
  loadEnvFile(new URL('../.env', import.meta.url))
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

export const BASE = (process.env.MONOSPACE_URL ?? 'http://localhost:8100').replace(/\/$/, '')
export const WS = process.env.MONOSPACE_WORKSPACE ?? 'riverside'
export const ADMIN = {
  email: process.env.MONOSPACE_ADMIN_EMAIL ?? 'admin@riverside.example',
  password: process.env.MONOSPACE_ADMIN_PASSWORD ?? 'RiversideDemo2026!',
}

export const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
}

export class ApiError extends Error {
  constructor(method, path, status, body) {
    super(`${method} ${path} -> ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`)
    Object.assign(this, { status, body })
  }
}

// request('/system/info') or request(`/${WS}/items/patients?fields=id`), path is under /api
export async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { accept: 'application/json' }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  const text = await res.text()
  let parsed = text
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {}
  if (!res.ok) throw new ApiError(method, path, res.status, parsed)
  return parsed
}

export async function login({ email, password } = ADMIN) {
  const body = await request('/auth/providers/local/password/login', {
    method: 'POST',
    body: { email, password, mode: 'json' },
  })
  return body.accessToken
}

export async function waitForMonospace(timeoutMs = 180_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      return await request('/system/info')
    } catch {
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
  throw new Error(`Monospace did not answer at ${BASE} within ${timeoutMs / 1000}s`)
}

export async function license(token) {
  return request('/system/license', { token })
}

export function isLicenseRefusal(error) {
  return error instanceof ApiError && error.status === 402
}

// Every collection with fields, keyed "Source.dbName" (ids differ per install).
export async function readCollections(token) {
  const m = await request(`/${WS}/schema`, { token })
  const s = (ref) => m.strings[ref]
  const { sources, collections } = m.monospaceSchema
  return collections.map((col) => ({
    id: col.id,
    apiName: s(col.apiName),
    dbName: s(col.dbName ?? col.apiName),
    source: s(sources[col.source].name),
    sourceId: sources[col.source].id,
    isSystem: col.isSystem ?? false,
    fields: col.primitiveFields.map((f) => ({ id: f.id, apiName: s(f.apiName), dbName: s(f.dbName ?? f.apiName) })),
    relations: col.relationFields.map((f) => ({ id: f.id, apiName: s(f.apiName) })),
  }))
}

export async function readSources(token) {
  const { data } = await request(`/${WS}/schema/structure/sources?fields=id,apiName,provider&limit=50`, { token })
  return data
}

export function table(rows, columns) {
  if (!rows.length) return c.dim('  (no rows)')
  const cols = columns ?? Object.keys(rows[0])
  const cell = (v) => (v === null || v === undefined ? c.dim('—') : typeof v === 'object' ? JSON.stringify(v) : String(v))
  const width = cols.map((k) => Math.min(28, Math.max(k.length, ...rows.map((r) => stripAnsi(cell(r[k])).length))))
  const line = (vals) => '  ' + vals.map((v, i) => padAnsi(trunc(v, width[i]), width[i])).join('  ')
  return [c.bold(line(cols)), ...rows.map((r) => line(cols.map((k) => cell(r[k]))))].join('\n')
}
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '')
const trunc = (s, w) => (stripAnsi(s).length > w ? stripAnsi(s).slice(0, w - 1) + '…' : s)
const padAnsi = (s, w) => s + ' '.repeat(Math.max(0, w - stripAnsi(s).length))

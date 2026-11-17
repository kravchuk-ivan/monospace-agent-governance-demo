// The run-of-show. Every call goes over Monospace's MCP endpoint (what an AI agent uses) or
// REST, against live data in both databases. Press Enter between beats (--no-pause to skip).
//   npm run demo
import { readFileSync, existsSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { randomUUID } from 'node:crypto'
import { BASE, WS, c, license, login, readCollections, request, table } from './lib.mjs'
import { loadAgent } from './setup-governance.mjs'

const PAUSE = process.stdin.isTTY && !process.argv.includes('--no-pause')
const env = existsSync(new URL('../.env.local', import.meta.url))
  ? Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
  : {}
if (!env.ADMIN_API_KEY) throw new Error('Run npm run setup first (no .env.local).')

const rl = PAUSE ? createInterface({ input: process.stdin, output: process.stdout }) : null
const pause = async () => rl && (await rl.question(c.dim('\n  ⏎ next')))
const beat = (n, title) => console.log(`\n${c.bold(c.cyan(`━━ ${n}. ${title} `.padEnd(78, '━')))}`)
const say = (text) => console.log(c.dim(`  SAY: ${text}`))
const call = (label) => console.log(`\n  ${c.yellow('▶')} ${label}`)

// One MCP tool call, exactly what Claude / any MCP client sends.
async function mcp(key, name, args) {
  const t0 = performance.now()
  const res = await fetch(`${BASE}/api/${WS}/mcp`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name, arguments: args } }),
  })
  const ms = Math.round(performance.now() - t0)
  const text = await res.text()
  if (!res.ok) return { ok: false, http: res.status, error: text, ms }
  const body = JSON.parse(text)
  const r = body.result ?? {}
  if (body.error || r.isError) return { ok: false, error: body.error?.message ?? r.content?.map((x) => x.text).join(' '), ms }
  return { ok: true, data: r.structuredContent?.data ?? r.structuredContent, ms }
}
function show(r, cols) {
  if (!r.ok) return console.log(`  ${c.red('✗ refused')} ${c.dim(r.http ? `HTTP ${r.http} ` : '')}${c.red(String(r.error).split('\n').slice(-2).join(' ').slice(0, 160))}`)
  const rows = Array.isArray(r.data) ? r.data : [r.data]
  console.log(table(rows, cols))
  console.log(c.dim(`  ${rows.length} row(s), ${r.ms} ms`))
}
const redact = (rows, fields) => rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, fields.includes(k) ? c.red(String(v)) : v])))

const ADMIN = env.ADMIN_API_KEY
const FRONT = env.FRONT_DESK_AGENT_KEY
const BILLING = env.BILLING_AGENT_KEY
const token = await login()
const lic = await license(token)
const licensed = Boolean(FRONT && BILLING)

console.log(c.bold('\n  Riverside Health × Monospace'))
console.log(c.dim(`  3 clinics · EHR in PostgreSQL (HIPAA) · card payments in MySQL (PCI DSS) · ${lic.management?.name}`))
console.log(c.dim(`  Goal: give a front-desk agent and a billing agent live access to both, safely.`))
await pause()

// ─────────────────────────────────────────────────────────────────────────────
beat(1, 'The problem: an agent with a shared key sees everything')
say('Most teams give an agent a DB credential or a shared admin key. Here is what it sees.')
call('list_items patients   (key: shared-admin-key)')
let r = await mcp(ADMIN, 'list_items', { collection: 'patients', fields: ['firstName', 'lastName', 'ssn', 'primaryDiagnosisCode', 'clinicalNotes'], limit: 3 })
if (r.ok) r.data = redact(r.data, ['ssn', 'primaryDiagnosisCode', 'clinicalNotes'])
show(r)
call('list_items paymentMethods   (key: shared-admin-key)')
r = await mcp(ADMIN, 'list_items', { collection: 'paymentMethods', fields: ['cardholderName', 'cardNumber', 'expMonth', 'expYear'], limit: 3 })
if (r.ok) r.data = redact(r.data, ['cardNumber', 'expMonth', 'expYear'])
show(r)
say('SSNs, diagnoses and full card numbers, all sent to the model provider. That is a HIPAA and a PCI finding.')
await pause()

// ─────────────────────────────────────────────────────────────────────────────
beat(2, 'One governed API over both systems, data stays where it is')
say('Monospace introspected both databases. No copy, no ETL. Postgres and MySQL behind one API.')
const cols = (await readCollections(token)).filter((x) => !x.isSystem)
console.log(table(cols.map((x) => ({ source: x.source, collection: x.apiName, fields: x.fields.length, relations: x.relations.map((y) => y.apiName).join(', ') }))))
call(`GET /api/${WS}/items/patients  include appointments (EHR) + billingAccounts.charges (Payments)`)
const t0 = performance.now()
const p360 = await request(
  `/${WS}/items/patients?fields=firstName,lastName&filter[lastName][_eq]=Alvarez` +
    `&include[appointments][fields]=startsAt,status,reason&include[appointments][filter][startsAt][_gte]=2026-11-19T00:00:00Z&include[appointments][limit]=1&include[appointments][sort][0][startsAt][direction]=asc` +
    `&include[billingAccounts][fields]=id,balanceDue&include[billingAccounts][include][charges][fields]=amount,status,description` +
    `&include[billingAccounts][include][charges][include][appointment][fields]=startsAt,status`,
  { token: ADMIN },
)
const ms = Math.round(performance.now() - t0)
const m = p360.data[0]
console.log(`  ${c.bold(`${m.firstName} ${m.lastName}`)}`)
for (const a of m.appointments.data) console.log(`    ${c.dim('EHR      ')} next appointment ${a.startsAt}  ${a.status}  ${a.reason}`)
for (const ch of m.billingAccounts.data[0].charges.data)
  console.log(`    ${c.dim('Payments ')} charge $${ch.amount} ${ch.status}  ${c.dim('→ EHR visit')} ${ch.appointment?.startsAt ?? '—'} ${ch.appointment?.status ?? ''}`)
console.log(c.dim(`  one request, two databases, ${ms} ms. The patient↔account and charge↔appointment relations exist only in Monospace.`))
say('Same API comes as REST, a typed TypeScript SDK (npm run app) and an MCP server per workspace.')
await pause()

// ─────────────────────────────────────────────────────────────────────────────
beat(3, 'Guardrails on the source: hold for every caller, admins included')
say('Each source has access settings. EHR and Payments: no deletes. Payments schema is locked (PCI change control).')
call('delete_item patients #60   (key: shared-admin-key)')
show(await mcp(ADMIN, 'delete_item', { collection: 'patients', key: 60, fields: ['id'] }))
call('mutate_schema: add column "cvv" to paymentMethods   (key: shared-admin-key)')
const pm = cols.find((x) => x.apiName === 'paymentMethods')
show(await mcp(ADMIN, 'mutate_schema', { operations: [{ kind: 'updateCollection', data: { id: pm.id, operations: [{ kind: 'createPrimitiveField', data: { id: randomUUID(), dbName: 'cvv', type: { name: 'string', params: { length: 'unlimited' } }, isNullable: true, isList: false } }] } }] }))
say('Even a prompt-injected admin agent cannot drop records or add a CVV column to the cardholder data environment.')
await pause()

// ─────────────────────────────────────────────────────────────────────────────
beat(4, 'Least privilege per agent: its own identity, row and field rules')
const front = loadAgent('front-desk-agent')
const billing = loadAgent('billing-agent')
if (licensed) {
  say('Same tool calls as beat 1. Same MCP endpoint. Different key, different answer, enforced inside the query.')
  call('front-desk-agent: list_items patients (asks for ssn too)')
  show(await mcp(FRONT, 'list_items', { collection: 'patients', fields: ['firstName', 'lastName', 'clinicId', 'phone', 'ssn'], limit: 5 }))
  call('front-desk-agent: list_items patients, only the allowed fields')
  show(await mcp(FRONT, 'list_items', { collection: 'patients', fields: ['firstName', 'lastName', 'clinicId', 'phone'], limit: 5 }))
  call('front-desk-agent: James Okafor (Northgate clinic, not its clinic)')
  show(await mcp(FRONT, 'list_items', { collection: 'patients', fields: ['firstName', 'lastName', 'clinicId'], filter: { lastName: { _eq: 'Okafor' } } }))
  call("front-desk-agent: cancel Maria's Thursday appointment (#1)")
  show(await mcp(FRONT, 'update_item', { collection: 'appointments', key: 1, data: { status: 'cancelled' }, fields: ['id', 'status', 'startsAt'] }))
  call('front-desk-agent: mark it "completed" (clinician-only status)')
  show(await mcp(FRONT, 'update_item', { collection: 'appointments', key: 1, data: { status: 'completed' }, fields: ['id', 'status'] }))
  call('front-desk-agent: read card data')
  show(await mcp(FRONT, 'list_items', { collection: 'paymentMethods', fields: ['cardLast4'], limit: 1 }))
  call('billing-agent: list_items paymentMethods (asks for cardNumber)')
  show(await mcp(BILLING, 'list_items', { collection: 'paymentMethods', fields: ['cardBrand', 'cardLast4', 'cardNumber'], limit: 3 }))
  call('billing-agent: list_items paymentMethods, masked fields only')
  show(await mcp(BILLING, 'list_items', { collection: 'paymentMethods', fields: ['cardBrand', 'cardLast4'], limit: 3 }))
  call('billing-agent: refund $25 on charge #1')
  show(await mcp(BILLING, 'create_items', { collection: 'refunds', data: [{ chargeId: 1, amount: '25.00', reason: 'Goodwill credit', requestedBy: 'billing-agent' }], fields: ['id', 'amount'] }))
  call('billing-agent: refund $500 (over its $200 limit)')
  show(await mcp(BILLING, 'create_items', { collection: 'refunds', data: [{ chargeId: 1, amount: '500.00', reason: 'Test', requestedBy: 'billing-agent' }], fields: ['id'] }))
  call("billing-agent: read Maria's diagnosis")
  show(await mcp(BILLING, 'list_items', { collection: 'patients', fields: ['firstName', 'primaryDiagnosisCode'], limit: 1 }))
  // put Maria's appointment back for the next run
  await request(`/${WS}/items/appointments/1?fields=id`, { method: 'PATCH', token: ADMIN, body: { status: 'confirmed' } }).catch(() => {})
} else {
  say('On a licensed workspace each agent is a service account with a role and a policy. Here are the two policies, as code.')
  for (const a of [front, billing]) {
    console.log(`\n  ${c.bold(a.displayName)}  ${c.dim(a.purpose)}`)
    for (const [rule, why] of Object.entries(a.regulations)) console.log(`    ${c.green('•')} ${c.bold(rule)}: ${why}`)
  }
  call('POST /policies front-desk-agent.json   (this instance: Starter license)')
  const res = await request(`/${WS}/policies`, { method: 'POST', token, body: { name: 'front-desk-agent', content: front.policy } }).catch((e) => e)
  console.log(`  ${c.yellow(`HTTP ${res.status}`)} ${JSON.stringify(res.body)}`)
  say('The engine parsed and accepted the policy (a malformed one gets 422), then refused on license: Starter has 0 custom policies.')
  say('Run npm run policies:check for the full access matrix across both databases.')
}
await pause()

// ─────────────────────────────────────────────────────────────────────────────
beat(5, 'Revoke in one place')
say('Every agent key is scoped to one identity and expires. Turning it off takes effect on the next call.')
const me = (await request('/system/users/me?fields=id', { token })).data
const tmp = await request('/system/api-keys', { method: 'POST', token, body: { name: 'agent-to-revoke', ttl: '1h', userId: me.id } })
call('agent key: list_items appointments')
r = await mcp(tmp.data.key, 'list_items', { collection: 'appointments', fields: ['id', 'status'], limit: 1 })
console.log(r.ok ? `  ${c.green('✓ works')} ${c.dim(`${r.ms} ms`)}` : `  ${c.red(r.error)}`)
call('PATCH /system/api-keys/:id  { active: false }')
await request(`/system/api-keys/${tmp.data.id}`, { method: 'PATCH', token, body: { active: false } })
call('agent key: same call again')
show(await mcp(tmp.data.key, 'list_items', { collection: 'appointments', fields: ['id', 'status'], limit: 1 }))
await pause()

// ─────────────────────────────────────────────────────────────────────────────
beat(6, 'Prove it: audit')
const audit = lic.entitlements?.audit_logs_enabled
say(audit?.default || audit?.override ? 'Studio → Audit log: agent calls, key changes and policy changes in one trail.' : 'Audit logs are a licensed feature (off on Starter). On Business they record auth events and role and policy changes.')
say('My product question: do audit logs record which records an agent READ? HIPAA asks who accessed which patient record.')

console.log(`\n${c.bold('  Close:')} Who controls which data an agent can access? Who can see what is running on your data right now?`)
console.log(`  If you had to revoke access tomorrow, could you?\n`)
rl?.close()

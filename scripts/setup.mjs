// One command from empty containers to a demo-ready workspace. Safe to re-run.
//   npm run setup
import { writeFileSync } from 'node:fs'
import { ADMIN, BASE, WS, c, login, request, waitForMonospace } from './lib.mjs'
import { setupSources } from './setup-sources.mjs'
import { setupRelations } from './setup-relations.mjs'
import { setupGovernance } from './setup-governance.mjs'

console.log(c.bold('\nRiverside Health × Monospace: setup\n'))
const info = await waitForMonospace()
console.log(`${c.green('✓')} Monospace is up at ${BASE}`)

// First run on a fresh instance: create the organization admin. This accepts the Monospace
// Terms for this local install (what Studio's first screen does), so it needs an explicit opt-in.
if (info.onboarding?.requireCreateUser) {
  if (process.env.MONOSPACE_ACCEPT_TERMS !== 'yes') {
    console.log(c.yellow(`\nFresh instance. Either open ${BASE} and create the admin yourself`))
    console.log(c.yellow(`(${ADMIN.email} / ${ADMIN.password}), or accept the Monospace Terms`))
    console.log(c.yellow(`(https://monospace.io/terms) and run: MONOSPACE_ACCEPT_TERMS=yes npm run setup\n`))
    process.exit(1)
  }
  await request('/system/bootstrap', { method: 'POST', body: { fullName: 'Riverside Admin', ...ADMIN, acceptTerms: true, acceptMarketing: false } })
  console.log(`${c.green('✓')} admin ${ADMIN.email} created`)
}

const token = await login()
await setupSources(token)
await setupRelations(token)
const { keys, licensed } = await setupGovernance(token)

// Keys for the demo scripts and the TypeScript app (gitignored)
writeFileSync(
  new URL('../.env.local', import.meta.url),
  [`MONOSPACE_URL=${BASE}`, `MONOSPACE_WORKSPACE=${WS}`, ...Object.entries(keys).map(([k, v]) => `${k}=${v}`)].join('\n') + '\n',
)

// Claude Code MCP config (gitignored): one server per identity, same endpoint, different key
const server = (key) => ({ type: 'http', url: `${BASE}/api/${WS}/mcp`, headers: { Authorization: `Bearer ${key}` } })
const mcpServers = { 'riverside-admin': server(keys.ADMIN_API_KEY) }
if (keys.FRONT_DESK_AGENT_KEY) mcpServers['riverside-front-desk'] = server(keys.FRONT_DESK_AGENT_KEY)
if (keys.BILLING_AGENT_KEY) mcpServers['riverside-billing'] = server(keys.BILLING_AGENT_KEY)
writeFileSync(new URL('../.mcp.json', import.meta.url), JSON.stringify({ mcpServers }, null, 2) + '\n')

console.log(`${c.green('✓')} wrote .env.local and .mcp.json (${Object.keys(mcpServers).join(', ')})`)
console.log(`\n${c.bold('Ready.')} Studio: ${BASE}  (${ADMIN.email} / ${ADMIN.password})`)
console.log(`Next: ${c.cyan('npm run demo')}${licensed ? '' : c.dim('   (Starter: agent-policy beat shows the policies + engine validation)')}\n`)

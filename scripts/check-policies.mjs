// Validates each governance/<agent>.json against the real engine and prints an access matrix:
// for every collection and field in BOTH databases, what each agent may read or write.
//
// Validation trick: Monospace parses the policy document before checking the license. On
// Starter, a well-formed policy is refused with 402 (license) and a malformed one with 422.
import { WS, c, isLicenseRefusal, license, login, readCollections, request } from './lib.mjs'
import { AGENTS, loadAgent } from './setup-governance.mjs'

const token = await login()
const lic = await license(token)
const licensed = (lic.entitlements?.custom_policies?.limit ?? 0) > 0

console.log(c.bold('\nPolicy validation against the engine\n'))
for (const name of AGENTS) {
  const def = loadAgent(name)
  if (licensed) {
    console.log(`${c.dim('•')} ${name}: licensed instance, applied by npm run setup (skipping probe)`)
    continue
  }
  try {
    await request(`/${WS}/policies`, { method: 'POST', token, body: { name: `probe-${name}`, content: def.policy } })
    console.log(`${c.green('✓')} ${name}: created (unexpected on Starter)`)
  } catch (error) {
    if (isLicenseRefusal(error)) console.log(`${c.green('✓')} ${name}: document accepted by the engine, then refused by license (402 ${error.body.code}: ${error.body.violations ?? 'custom_policies limit 0'})`)
    else console.log(`${c.red('✗')} ${name}: ${error.status} ${JSON.stringify(error.body)}`)
  }
}

// Access matrix (computed from the policy files + the live schema)
const cols = (await readCollections(token)).filter((x) => !x.isSystem)
const defs = AGENTS.map(loadAgent)
const mark = (policy, col, field) => {
  const item = policy.itemRules?.[col] ?? {}
  const fr = policy.fieldRules?.[col] ?? {}
  const has = (action) => item[action] !== undefined && (fr[action] === '*' || (fr[action] && field in fr[action]))
  const r = has('read')
  const w = has('update') || has('create')
  return r && w ? c.green('RW') : r ? c.green('R ') : w ? c.yellow(' W') : c.red('· ')
}
const scope = (policy, col) => {
  const f = policy.itemRules?.[col]?.read?.filter
  return f ? c.cyan(`rows: ${JSON.stringify(f)}`) : policy.itemRules?.[col] ? c.dim('rows: all') : c.red('no access')
}

console.log(c.bold('\nAccess matrix') + c.dim('   R read · W write · "·" never returned to the agent\n'))
for (const source of ['EHR', 'Payments']) {
  console.log(c.bold(`${source === 'EHR' ? 'EHR (PostgreSQL, HIPAA)' : 'Payments (MySQL, PCI DSS CDE)'}`))
  for (const col of cols.filter((x) => x.source === source)) {
    console.log(`  ${c.bold(col.apiName.padEnd(22))} ${defs.map((d) => `${d.agent}: ${scope(d.policy, col.apiName)}`).join('   ')}`)
    for (const f of col.fields) {
      console.log(`    ${f.apiName.padEnd(22)} ${defs.map((d) => `${d.agent.padEnd(16)} ${mark(d.policy, col.apiName, f.apiName)}`).join('   ')}`)
    }
  }
  console.log()
}
const v = (d) => Object.entries(d.policy.validationRules ?? {}).map(([k, r]) => `${k}: ${JSON.stringify(r.map((x) => x.filter))}`).join('; ')
for (const d of defs) console.log(`${c.bold(d.agent)} validation rules: ${v(d) || 'none'}   entitlements: ${d.policy.entitlements.join(', ')}`)
console.log()

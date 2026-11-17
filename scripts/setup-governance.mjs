// Step 3: one identity per agent, least-privilege policy per agent, expiring keys.
//
// Licensed instance (MONOSPACE_LICENSE__KEY in license.env):
//   service account per agent -> role -> policy from governance/<agent>.json -> 30-day API key
// Starter (no key): custom policies/roles/service accounts are refused with HTTP 402, so only
//   the admin key is issued. The policies are still validated by the engine (npm run policies:check).
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { WS, c, isLicenseRefusal, license, request } from './lib.mjs'

export const AGENTS = ['front-desk-agent', 'billing-agent']
const STATE = new URL('../.state.json', import.meta.url)
export const readState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {})
export const writeState = (s) => writeFileSync(STATE, JSON.stringify(s, null, 2))
export const loadAgent = (name) => JSON.parse(readFileSync(new URL(`../governance/${name}.json`, import.meta.url), 'utf8'))
const id = (r) => (r?.data ?? r).id

export async function setupGovernance(token) {
  const state = readState()
  const lic = await license(token)
  const licensed = (lic.entitlements?.custom_policies?.limit ?? 0) > 0
  console.log(`${c.dim('•')} license: ${lic.management?.name ?? 'unknown'}`)

  const keys = {}
  const me = (await request('/system/users/me?fields=id', { token })).data

  // The "before" picture: one shared admin key (what most teams hand to agents today).
  await deactivate(token, state.adminKeyId)
  const admin = await request('/system/api-keys', { method: 'POST', token, body: { name: 'shared-admin-key', description: 'Full access. The anti-pattern this demo replaces.', ttl: '7d', userId: me.id } })
  keys.ADMIN_API_KEY = admin.data.key
  state.adminKeyId = admin.data.id
  console.log(`${c.green('✓')} shared admin key issued (expires in 7 days)`)

  if (!licensed) {
    console.log(c.yellow(`! Starter license: custom policies, roles and service accounts are refused (HTTP 402).`))
    console.log(c.yellow(`  Agent identities are skipped. Policies are validated with: npm run policies:check`))
    console.log(c.yellow(`  Add MONOSPACE_LICENSE__KEY to license.env, restart, and re-run setup to enforce them.`))
    writeState(state)
    return { keys, licensed }
  }

  state.agents ??= {}
  for (const name of AGENTS) {
    const def = loadAgent(name)
    const s = (state.agents[name] ??= {})
    try {
      // Policy (create or update in place, so editing the JSON and re-running applies the change)
      if (s.policyId) await request(`/${WS}/policies/${s.policyId}`, { method: 'PATCH', token, body: { name: def.agent, content: def.policy } })
      else s.policyId = id(await request(`/${WS}/policies`, { method: 'POST', token, body: { name: def.agent, content: def.policy } }))
      // Role holding the policy
      if (!s.roleId) {
        s.roleId = id(await request(`/${WS}/roles`, { method: 'POST', token, body: { name: def.displayName } }))
        await request(`/${WS}/roles/${s.roleId}/policies`, { method: 'POST', token, body: { policyId: s.policyId } })
      }
      // Its own identity: a service account, not a borrowed human login
      if (!s.serviceAccountId) {
        s.serviceAccountId = id(await request('/system/service-accounts', { method: 'POST', token, body: { fullName: def.displayName } }))
        await request(`/${WS}/service-accounts`, { method: 'POST', token, body: { serviceAccountId: s.serviceAccountId, roles: [s.roleId] } })
      }
      // Fresh 30-day key; the previous one is deactivated
      await deactivate(token, s.keyId)
      const key = await request('/system/api-keys', { method: 'POST', token, body: { name: `${name}-key`, description: def.purpose, ttl: '30d', userId: s.serviceAccountId } })
      s.keyId = key.data.id
      keys[name === 'front-desk-agent' ? 'FRONT_DESK_AGENT_KEY' : 'BILLING_AGENT_KEY'] = key.data.key
      console.log(`${c.green('✓')} ${c.bold(name)}: service account + role + policy + 30-day key`)
    } catch (error) {
      if (!isLicenseRefusal(error)) throw error
      console.log(c.yellow(`! ${name}: refused by license (${error.body?.code}): ${error.body?.message}`))
    }
  }
  writeState(state)
  return { keys, licensed }
}

async function deactivate(token, keyId) {
  if (!keyId) return
  await request(`/system/api-keys/${keyId}`, { method: 'PATCH', token, body: { active: false } }).catch(() => {})
}

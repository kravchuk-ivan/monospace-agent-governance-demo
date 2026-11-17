// Step 1: workspace + connect both systems of record. Safe to re-run.
// Data stays where it is: Monospace introspects the schema and queries live.
import { WS, c, login, request, readSources, waitForMonospace } from './lib.mjs'

export const SOURCES = [
  {
    apiName: 'EHR',
    provider: 'postgres',
    host: 'ehr-postgres',
    port: 5432,
    user: 'monospace',
    password: 'monospace',
    dbname: 'ehr',
    // Clinical records: the app can create and update, nobody deletes through the API.
    access: { allowMigrations: false, allowCreate: true, allowUpdate: true, allowDelete: false },
  },
  {
    apiName: 'Payments',
    provider: 'mysql',
    host: 'payments-mysql',
    port: 3306,
    user: 'monospace',
    password: 'monospace',
    dbname: 'payments',
    // PCI cardholder data environment: schema locked for everyone (admins included),
    // no deletes. Creates allowed so the billing agent can file refunds.
    access: { allowMigrations: false, allowCreate: true, allowUpdate: true, allowDelete: false },
  },
]

export async function setupSources(token) {
  const { data: workspaces } = await request('/system/workspaces?fields=id,apiName', { token })
  if (!workspaces.some((w) => w.apiName === WS)) {
    await request('/system/workspaces', { method: 'POST', token, body: { apiName: WS, displayName: 'Riverside Health' } })
    console.log(`${c.green('✓')} workspace ${c.bold(WS)} created`)
  } else console.log(`${c.dim('•')} workspace ${WS} exists`)

  const existing = await readSources(token)
  for (const { access, ...source } of SOURCES) {
    const found = existing.find((s) => s.apiName === source.apiName)
    if (found) {
      await request(`/${WS}/sources/data/${found.id}`, { method: 'PATCH', token, body: { access } })
      console.log(`${c.dim('•')} source ${source.apiName} already connected (access re-applied)`)
      continue
    }
    await request(`/${WS}/sources/data`, { method: 'POST', token, body: { ...source, access } })
    console.log(`${c.green('✓')} source ${c.bold(source.apiName)} connected: ${source.provider}://${source.host}/${source.dbname}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await waitForMonospace()
  await setupSources(await login())
}

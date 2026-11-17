// Patient 360: one typed query across two databases (EHR in Postgres, Payments in MySQL).
// Apps and agents use the same governed API: run it with different keys and the SAME code
// gets different answers, decided by Monospace, not by this file.
//
//   npm run app                      # admin key (from .env.local)
//   npm run app -- front-desk        # front-desk-agent key (needs a license)
//   npm run app -- billing           # billing-agent key   (needs a license)
import { readFileSync } from 'node:fs'
import { createClient } from './generated/monospace/index.ts'

const who = (process.argv[2] ?? 'admin') as 'admin' | 'front-desk' | 'billing'
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const apiKey = { admin: env.ADMIN_API_KEY, 'front-desk': env.FRONT_DESK_AGENT_KEY, billing: env.BILLING_AGENT_KEY }[who]
if (!apiKey) throw new Error(`No key for ${who} in .env.local. Run npm run setup (agent keys need a license).`)

const client = createClient({ url: env.MONOSPACE_URL ?? 'http://localhost:8100', workspace: 'riverside', apiKey })

const patients = await client.patients.readMany({
  fields: ['id', 'mrn', 'firstName', 'lastName'],
  filter: { lastName: { _eq: 'Alvarez' } },
  include: {
    // EHR (Postgres)
    appointments: {
      fields: ['id', 'startsAt', 'status', 'reason'],
      sort: [{ startsAt: { direction: 'asc' } }],
      limit: 3,
    },
    // Payments (MySQL), joined by a relation that exists only in Monospace
    billingAccounts: {
      fields: ['id', 'balanceDue'],
      include: { charges: { fields: ['id', 'amount', 'status', 'description'] } },
    },
  },
})

console.log(`\nPatient 360 as ${who}\n`)
console.dir(patients, { depth: 6 })

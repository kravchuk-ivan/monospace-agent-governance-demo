// Step 2: relations ACROSS the two databases. They live in Monospace's model only.
// No foreign key is written to either database (Payments is schema-locked anyway).
//   Payments.billingAccounts.ehrPatientId  ->  EHR.patients     (patient / billingAccounts)
//   Payments.charges.ehrAppointmentId      ->  EHR.appointments (appointment / charges)
import { randomUUID } from 'node:crypto'
import { WS, c, login, readCollections, request } from './lib.mjs'

const RELATIONS = [
  { name: 'BillingAccountPatient', from: ['billingAccounts', 'ehrPatientId', 'patient'], to: ['patients', 'id', 'billingAccounts'] },
  { name: 'ChargeAppointment', from: ['charges', 'ehrAppointmentId', 'appointment'], to: ['appointments', 'id', 'charges'] },
]

export async function setupRelations(token) {
  const cols = await readCollections(token)
  const col = (apiName) => cols.find((x) => x.apiName === apiName) ?? fail(`collection ${apiName} not found`)
  for (const r of RELATIONS) {
    const [fromCol, fromKey, fromName] = r.from
    const [toCol, toKey, toName] = r.to
    const a = col(fromCol)
    const b = col(toCol)
    if (a.relations.some((x) => x.apiName === fromName)) {
      console.log(`${c.dim('•')} relation ${fromCol}.${fromName} exists`)
      continue
    }
    const field = (cc, apiName) => cc.fields.find((f) => f.apiName === apiName)?.id ?? fail(`${cc.apiName}.${apiName} missing`)
    await request(`/${WS}/schema/migrate`, {
      method: 'POST',
      token,
      body: {
        operations: [
          {
            kind: 'createRelationFieldPair',
            data: {
              kind: 'single',
              data: {
                relationName: r.name,
                // Many side holds the key. Marked constrained: metadata only, no FK in MySQL.
                firstField: { id: randomUUID(), apiName: fromName, isList: false, isConstrained: true, collectionId: a.id, fieldIds: [field(a, fromKey)] },
                secondField: { id: randomUUID(), apiName: toName, isList: true, isConstrained: false, collectionId: b.id, fieldIds: [field(b, toKey)] },
              },
            },
          },
        ],
      },
    })
    console.log(`${c.green('✓')} cross-source relation ${c.bold(`${a.source}.${fromCol}.${fromName} → ${b.source}.${toCol}`)} (+ ${toCol}.${toName})`)
  }
}

function fail(msg) {
  throw new Error(msg)
}

if (import.meta.url === `file://${process.argv[1]}`) await setupRelations(await login())

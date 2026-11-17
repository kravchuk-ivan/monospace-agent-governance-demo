# Run-of-show: Riverside Health (5–7 minutes)

**The angle:** two regulations, two databases, one governed layer. Healthcare is where agent governance is urgent, budgeted and compliance-driven. Adding the payments system shows the federation value: the agent needs answers that span the EHR and the card-payments system, and each regime has its own rules (HIPAA minimum necessary, PCI DSS need-to-know and masking). A gateway can allow or block a tool call, but it can't build the query, so it can't decide which rows and fields come back. Monospace can.

**Before the call:** `npm run up` → `npm run demo:fast` once (warms the cache) → terminal font large → Studio open on the data model.

## Setup line (15 seconds)

> "Riverside Health runs three clinics. Patient records are in Postgres, card payments in a separate MySQL billing system. They want a front-desk agent and a billing agent working on live data. Let me show what that looks like with and without Monospace."

## Beat 1: the problem (45 s)

Shared admin key over MCP: `list_items patients` returns SSN, diagnosis (including an HIV code) and notes. `list_items paymentMethods` returns full card numbers and expiry.

> "This is what an agent sees with a database credential or a shared key. Every one of these values goes into the model's context and to the LLM provider. For a HIPAA and PCI shop, that's two findings before the agent has done anything."

## Beat 2: one API, data stays put (60 s)

Both sources introspected into 8 collections. One request returns Maria's next EHR appointment and her MySQL charges, each charge linked back to its EHR visit.

> "Monospace connected both databases where they live. Nothing copied, no pipeline. The patient-to-billing-account and charge-to-visit links exist only in Monospace, because the two databases can't reference each other. One request, two engines, about 10 milliseconds. The same API comes as REST, a typed TypeScript SDK and an MCP server per workspace."

Optional: `npm run app` shows the same query from typed TypeScript.

## Beat 3: guardrails for everyone (45 s)

The admin key tries `delete_item patients` and gets "deleteOne operation not found". It tries `mutate_schema` to add a `cvv` column to the card table and gets "the database schema of data source Payments is locked".

> "These rules sit on the data source, so they hold for every caller, admins included. Even a prompt-injected agent with an admin key can't delete records or change the cardholder data environment's schema. For PCI that's change control. Locked schemas shipped in 1.1."

## Beat 4: least privilege per agent (90 s)

**Licensed:** same calls with the agent keys. The front desk sees its own clinic only, with no SSN or diagnosis. It can cancel an appointment but can't mark one "completed", and gets nothing from the card table. The billing agent sees brand and last 4 only, can file a $25 refund, and gets refused at $500.

**Starter (tonight):** show the two policy files and the HTTP 402. Then run `npm run policies:check` for the access matrix.

> "Each agent is its own identity, a service account, not a borrowed login. Each one gets a policy: row filters, field rules and validation rules on writes, enforced inside the query. The front desk sees one clinic and no clinical fields. The billing agent sees last 4, never the PAN, and can refund up to $200. Above that, a human."
>
> "On the free tier the engine accepts these policies and then refuses them on license, which you can see here. I built against that honestly."

## Beat 5: revoke (20 s)

The key works. `active: false`. The next call gets 401.

> "Revoking is one call and takes effect on the next request. Keys expire too: agents get 30 days in this setup."

## Beat 6: audit + close (30 s)

> "On Business, every agent call and every policy change goes into one audit log. The question I'd bring from the field: does it record which records an agent read? HIPAA asks who accessed which patient.
>
> Who controls which data an agent can access? Who can see what's running on your data right now? If you had to revoke access tomorrow, could you?"

## Likely questions

| Q | A |
|---|---|
| Why not an MCP gateway? | A gateway sees the tool call. Monospace builds the query, so it decides which rows and fields come back. Use both: a gateway for tool routing, Monospace for the data. |
| Why not a warehouse? | Agents and apps write back (cancel, refund). A copy can't take writes and goes stale. This is operational, live read-write. |
| Does this take the agent out of PCI scope? | It keeps the PAN out of the agent and the LLM provider. Monospace itself connects to the CDE, so it's in scope. That's a QSA conversation, and a smaller one. |
| Performance? | Rust engine, Redis-cached reads, replicas. Target 200 ms per API call. This demo runs in single-digit ms locally. |
| What if the agent asks for a forbidden field? | The request is refused or the field is dropped, decided in the engine. The agent never receives it. (Verify the exact behavior on a licensed instance.) |
| Why healthcare first? | Urgent pain, existing budget, and compliance makes it a must-have. Second choice: internal apps on live data. |

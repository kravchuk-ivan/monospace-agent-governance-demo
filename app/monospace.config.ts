import { defineConfig } from '@monospace/sdk/config'

// Generates from the OpenAPI document scripts/sdk-generate.mjs downloads (no credentials here).
export default defineConfig({
  input: './openapi.json',
  output: './generated/monospace',
})

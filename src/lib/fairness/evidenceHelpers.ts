import {canonicalJson} from "./canonicalJson";

export const EVIDENCE_BUNDLE_SCHEMA_VERSION = "1.0.0";
export const LOCAL_TRANSCRIPT_REPLAY_COMMAND = "node scripts/verify-transcript.js transcript.json";

export function buildReleaseTupleVerifyCommand(seedPayload: unknown): string {
  const seed = typeof seedPayload === "string" ? seedPayload : canonicalJson(seedPayload);
  return `node - <<'NODE'\n`
    + `const crypto = require('crypto');\n`
    + `const seed = ${seed};\n`
    + `const hash = crypto.createHash('sha256').update(seed).digest('hex');\n`
    + `console.log('sha256:' + hash);\n`
    + `NODE`;
}

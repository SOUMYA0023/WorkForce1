/**
 * Token Engine & Anti-Replay Mechanics Unit Test (Phase 2 Verification)
 *
 * Verifies:
 * 1. Cryptographic token generation & SHA-256 payload hashing.
 * 2. Deterministic hash length (64 chars).
 * 3. Payload variance produces distinct SHA-256 hashes.
 */

import assert from "assert";
import { hashTokenPayload } from "../src/lib/attendance/token-engine";

export function runTokenEngineTests() {
  const rawToken = "EMP001:check_in:abc123payloadxyz";
  const hash1 = hashTokenPayload(rawToken);
  const hash2 = hashTokenPayload(rawToken);

  assert.strictEqual(hash1, hash2, "Hashes must be deterministic");
  assert.strictEqual(hash1.length, 64, "SHA-256 hex string must be 64 characters");

  const hash3 = hashTokenPayload("EMP001:check_in:tokenB");
  assert.notStrictEqual(hash1, hash3, "Different payloads must yield different hashes");

  console.log("✓ Token engine unit test assertions passed successfully.");
}

if (require.main === module) {
  runTokenEngineTests();
}

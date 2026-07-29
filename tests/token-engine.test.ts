import { describe, it, expect } from "vitest";
import { hashTokenPayload } from "../src/lib/attendance/token-engine";

describe("Phase 2 — Token Engine & Anti-Replay Mechanics Unit Suite", () => {
  it("Should generate deterministic SHA-256 hashes of 64 characters", () => {
    const rawToken = "EMP001:check_in:abc123payloadxyz";
    const hash1 = hashTokenPayload(rawToken);
    const hash2 = hashTokenPayload(rawToken);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });

  it("Should produce distinct hashes for different raw payloads", () => {
    const hash1 = hashTokenPayload("EMP001:check_in:abc123payloadxyz");
    const hash3 = hashTokenPayload("EMP001:check_in:tokenB");

    expect(hash1).not.toBe(hash3);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  getSupabaseKey,
  getSupabaseUrl,
  isCloudConfigured,
  requireSupabaseEnv,
} from "./env";

const URL = "https://xyzcompany.supabase.co";
const PUB = "sb_publishable_test";
const ANON = "anon-jwt-test";

const VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

// Save/restore: other test files share the worker, so never leak env.
const saved: Record<string, string | undefined> = {};
for (const v of VARS) saved[v] = process.env[v];

afterEach(() => {
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
});

function clearAll() {
  for (const v of VARS) delete process.env[v];
}

describe("supabase env", () => {
  it("is not configured when empty (V1 local mode)", () => {
    clearAll();
    expect(isCloudConfigured()).toBe(false);
    expect(getSupabaseUrl()).toBeUndefined();
    expect(getSupabaseKey()).toBeUndefined();
  });

  it("accepts URL + publishable key", () => {
    clearAll();
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUB;
    expect(isCloudConfigured()).toBe(true);
    expect(requireSupabaseEnv()).toEqual({ url: URL, key: PUB });
  });

  it("falls back to the legacy anon key", () => {
    clearAll();
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON;
    expect(isCloudConfigured()).toBe(true);
    expect(getSupabaseKey()).toBe(ANON);
  });

  it("prefers the publishable key over anon", () => {
    clearAll();
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUB;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON;
    expect(getSupabaseKey()).toBe(PUB);
  });

  it("requireSupabaseEnv fails fast with directions", () => {
    clearAll();
    expect(() => requireSupabaseEnv()).toThrow(/\.env\.example/);
  });
});

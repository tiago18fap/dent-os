// Substitui deno.land/std/crypto/mod.ts (so createHmac e citado no DentOS).
export { createHmac, createHash, randomUUID } from "node:crypto";

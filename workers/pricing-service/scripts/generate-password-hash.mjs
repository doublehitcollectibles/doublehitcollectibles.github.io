import { pbkdf2Sync, randomBytes } from "node:crypto";

function toBase64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

const password = process.argv[2];
const iterations = Number.parseInt(process.argv[3] ?? "310000", 10);

if (!password) {
  console.error("Usage: npm run hash-password -- \"your-password\" [iterations]");
  process.exit(1);
}

if (!Number.isFinite(iterations) || iterations < 100000) {
  console.error("Iterations must be a number greater than or equal to 100000.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");

console.log(`${iterations}:${toBase64Url(salt)}:${toBase64Url(hash)}`);

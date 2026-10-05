import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const cipherAlgorithm = 'aes-256-gcm';
const initializationVectorLengthInBytes = 12;
const authenticationTagLengthInBytes = 16;
const headerLengthInBytes = initializationVectorLengthInBytes + authenticationTagLengthInBytes;

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function sealCookieValue(secret: string, cookieName: string, payload: unknown): string {
  const initializationVector = randomBytes(initializationVectorLengthInBytes);
  const cipher = createCipheriv(cipherAlgorithm, deriveKey(secret), initializationVector, {
    authTagLength: authenticationTagLengthInBytes,
  }).setAAD(Buffer.from(cookieName));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return Buffer.concat([initializationVector, cipher.getAuthTag(), encrypted]).toString(
    'base64url',
  );
}

export function openCookieValue(secret: string, cookieName: string, sealed: string): unknown {
  const bytes = Buffer.from(sealed, 'base64url');
  try {
    const decipher = createDecipheriv(
      cipherAlgorithm,
      deriveKey(secret),
      bytes.subarray(0, initializationVectorLengthInBytes),
      { authTagLength: authenticationTagLengthInBytes },
    )
      .setAAD(Buffer.from(cookieName))
      .setAuthTag(bytes.subarray(initializationVectorLengthInBytes, headerLengthInBytes));
    const decrypted = Buffer.concat([
      decipher.update(bytes.subarray(headerLengthInBytes)),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return undefined;
  }
}

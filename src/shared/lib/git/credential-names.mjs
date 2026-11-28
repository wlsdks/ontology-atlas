// Names that are never read as evidence, kept free of Node imports so the browser bundle can
// ask the same question before it requests a file from the desktop app.

export const SENSITIVE = /^(?:credential|credentials|secret|secrets|private[-_]?key|id_rsa|id_ed25519)(?:\.[^.]+)?$|\.(?:pem|key|p12|pfx|jks|keystore)$/i;

/** Whether any segment of a `/` path is hidden (leading `.`) or named like a credential, so it is never read. */
export function namesHiddenOrCredentialFile(path) {
  return path.split('/').some((part) => part.startsWith('.') || SENSITIVE.test(part));
}

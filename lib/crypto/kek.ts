import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * Master key (KEK) providers.
 *
 * The KEK wraps every organization's data key and must never be stored
 * alongside the data it protects. Two providers:
 *
 * - `env`  — KEK derived from MASTER_KEY_<id> / ENCRYPTION_KEY. Fine for
 *   self-hosting and development; the operator holds the key.
 * - `awskms` — the KEK never leaves AWS KMS; wrap/unwrap are API calls.
 *   Enable with KMS_PROVIDER=awskms and KMS_KEY_ID=arn:aws:kms:...
 *
 * `activeKekId` is recorded on each org so the KEK can be rotated without
 * re-wrapping every tenant at once.
 */

export type KekProviderName = "env" | "awskms";

export interface KekProvider {
  readonly name: KekProviderName;
  /** Identifier recorded on the org, e.g. "env:v1" or the KMS key ARN. */
  readonly activeKekId: string;
  wrap(dek: Buffer, kekId?: string): Promise<string>;
  unwrap(wrapped: string, kekId: string): Promise<Buffer>;
}

/* -------------------------------------------------------------------------- */

class EnvKekProvider implements KekProvider {
  readonly name = "env" as const;

  get activeKekId(): string {
    return `env:${env.masterKeyVersion}`;
  }

  private keyFor(kekId: string): Buffer {
    const version = kekId.startsWith("env:") ? kekId.slice(4) : kekId;
    // MASTER_KEY_V2 etc. allow rotation; fall back to the base secret.
    const material =
      process.env[`MASTER_KEY_${version.toUpperCase()}`]?.trim() ||
      process.env.MASTER_KEY?.trim() ||
      env.encryptionKey;
    return crypto.createHash("sha256").update(material).digest();
  }

  async wrap(dek: Buffer, kekId?: string): Promise<string> {
    const { wrapDek } = await import("@/lib/crypto/envelope");
    return wrapDek(this.keyFor(kekId ?? this.activeKekId), dek);
  }

  async unwrap(wrapped: string, kekId: string): Promise<Buffer> {
    const { unwrapDek } = await import("@/lib/crypto/envelope");
    return unwrapDek(this.keyFor(kekId), wrapped);
  }
}

/* -------------------------------------------------------------------------- */

/** Minimal structural type for the optional @aws-sdk/client-kms dependency. */
interface AwsKmsModule {
  KMSClient: new (config: Record<string, unknown>) => {
    send(command: unknown): Promise<{
      CiphertextBlob?: Uint8Array;
      Plaintext?: Uint8Array;
    }>;
  };
  EncryptCommand: new (input: { KeyId: string; Plaintext: Buffer }) => unknown;
  DecryptCommand: new (input: { CiphertextBlob: Buffer }) => unknown;
}

/**
 * AWS KMS provider. The plaintext DEK is sent to KMS for encryption and the
 * returned blob is stored; unwrap calls Decrypt. Requires @aws-sdk/client-kms,
 * which is loaded lazily so the dependency is only needed when enabled.
 */
class AwsKmsProvider implements KekProvider {
  readonly name = "awskms" as const;

  get activeKekId(): string {
    return env.kmsKeyId ?? "";
  }

  /**
   * Loaded through a computed specifier: @aws-sdk/client-kms is an optional
   * peer dependency, so it must not become a build-time module resolution.
   */
  private async client(): Promise<AwsKmsModule> {
    const specifier = ["@aws-sdk", "client-kms"].join("/");
    const mod = (await import(specifier).catch(() => null)) as AwsKmsModule | null;
    if (!mod?.KMSClient) {
      throw new Error(
        "KMS_PROVIDER=awskms requires the @aws-sdk/client-kms package. Install it or set KMS_PROVIDER=env.",
      );
    }
    return mod;
  }

  async wrap(dek: Buffer, kekId?: string): Promise<string> {
    const { KMSClient, EncryptCommand } = await this.client();
    const keyId = kekId ?? this.activeKekId;
    if (!keyId) throw new Error("KMS_KEY_ID is not configured");
    const kms = new KMSClient({});
    const res = await kms.send(
      new EncryptCommand({ KeyId: keyId, Plaintext: dek }),
    );
    if (!res.CiphertextBlob) throw new Error("KMS returned no ciphertext");
    return Buffer.from(res.CiphertextBlob).toString("base64");
  }

  async unwrap(wrapped: string): Promise<Buffer> {
    const { KMSClient, DecryptCommand } = await this.client();
    const kms = new KMSClient({});
    const res = await kms.send(
      new DecryptCommand({ CiphertextBlob: Buffer.from(wrapped, "base64") }),
    );
    if (!res.Plaintext) throw new Error("KMS returned no plaintext");
    return Buffer.from(res.Plaintext);
  }
}

/* -------------------------------------------------------------------------- */

let provider: KekProvider | null = null;

export function kekProvider(): KekProvider {
  if (!provider) {
    provider =
      env.kmsProvider === "awskms" ? new AwsKmsProvider() : new EnvKekProvider();
  }
  return provider;
}

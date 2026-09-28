import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export const QUALIFICATION_EVIDENCE_SCHEMA_VERSION =
    "qualification-evidence.v1";

const SENSITIVE_KEY_PATTERN =
    /(password|passphrase|token|cookie|session|secret|credential|authorization|connectionstring|connection-string)/i;

export interface QualificationEvidenceEnvelope {
    schemaVersion: typeof QUALIFICATION_EVIDENCE_SCHEMA_VERSION;
    recordedAt: string;
    operationIds: string[];
    evidence: unknown;
}

function redactString(value: string, secrets: readonly string[]): string {
    return secrets
        .filter((secret) => secret.length > 0)
        .reduce(
            (redacted, secret) => redacted.replaceAll(secret, "[redacted]"),
            value,
        );
}

export function redactQualificationEvidence(
    value: unknown,
    secrets: readonly string[] = [],
): unknown {
    if (typeof value === "string") return redactString(value, secrets);
    if (Array.isArray(value)) {
        return value.map((entry) =>
            redactQualificationEvidence(entry, secrets),
        );
    }
    if (value === null || typeof value !== "object") return value;

    return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
            key,
            SENSITIVE_KEY_PATTERN.test(key)
                ? "[redacted]"
                : redactQualificationEvidence(entry, secrets),
        ]),
    );
}

function operationIdsFor(evidence: unknown): string[] {
    if (!evidence || typeof evidence !== "object") return [];
    const candidate = (evidence as { operationId?: unknown }).operationId;
    if (typeof candidate === "string" && candidate.length > 0) {
        return [candidate];
    }
    return [];
}

function evidenceFileName(evidence: unknown): string {
    if (evidence && typeof evidence === "object") {
        const runId = (evidence as { runId?: unknown }).runId;
        if (typeof runId === "string" && /^[a-zA-Z0-9_-]+$/.test(runId)) {
            return `${runId}.json`;
        }
    }
    return `${randomUUID()}.json`;
}

export async function writeQualificationEvidence(
    evidence: unknown,
    destination: string | undefined,
    secrets: readonly string[] = [],
): Promise<string> {
    if (!destination?.trim()) {
        throw new Error(
            "qualification evidence destination is required; set QUALIFICATION_EVIDENCE_DIR",
        );
    }

    const directory = resolve(destination);
    await mkdir(directory, { recursive: true });
    const envelope: QualificationEvidenceEnvelope = {
        schemaVersion: QUALIFICATION_EVIDENCE_SCHEMA_VERSION,
        recordedAt: new Date().toISOString(),
        operationIds: operationIdsFor(evidence),
        evidence: redactQualificationEvidence(evidence, secrets),
    };
    const outputPath = join(directory, evidenceFileName(evidence));
    await writeFile(outputPath, `${JSON.stringify(envelope, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
    });
    return outputPath;
}

export function evidenceFileNameForTest(evidence: unknown): string {
    return basename(evidenceFileName(evidence));
}

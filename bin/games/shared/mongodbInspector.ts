/*
 * MongoDB Database Inspector
 *
 * Scans the actual MongoDB database to:
 * 1. Discover all collections
 * 2. Analyze field types in each collection
 * 3. Compare actual types against schema registry
 * 4. Generate comprehensive type violation reports
 * 5. Identify new/undocumented collections
 */

import { Db } from "mongodb";
import {
    getAllDefinedCollections,
    getCollectionSchema,
    validateFieldType,
    getTimestampFields,
    getVersionFields,
    getIntegerFields,
} from "./mongodbSchemaRegistry";

export interface FieldTypeInfo {
    fieldPath: string;
    mongoType: string;
    documentCount: number;
    exampleValues: unknown[];
}

export interface CollectionTypeAnalysis {
    collectionName: string;
    documentCount: number;
    fields: FieldTypeInfo[];
    violations: TypeViolation[];
    isDocumented: boolean;
}

export interface TypeViolation {
    fieldPath: string;
    expectedType: string;
    actualType: string;
    affectedDocuments: number;
    violationType: "type_mismatch" | "undocumented_field" | "missing_field";
    severity: "critical" | "warning" | "info";
    examples: unknown[];
}

export interface DatabaseAnalysisReport {
    timestamp: number;
    totalCollections: number;
    documentedCollections: number;
    undocumentedCollections: string[];
    analysisPerCollection: CollectionTypeAnalysis[];
    totalViolations: number;
    violationsBySeverity: Record<"critical" | "warning" | "info", number>;
    recommendations: string[];
}

/**
 * Analyze a single collection for type violations
 */
export async function analyzeCollection(
    db: Db,
    collectionName: string,
): Promise<CollectionTypeAnalysis> {
    const collection = db.collection(collectionName);
    const documentCount = await collection.countDocuments();

    if (documentCount === 0) {
        return {
            collectionName,
            documentCount: 0,
            fields: [],
            violations: [],
            isDocumented: getAllDefinedCollections().includes(collectionName),
        };
    }

    // Get field type distribution
    const fieldAnalysis = await collection
        .aggregate([
            {
                $facet: {
                    fieldTypes: [
                        {
                            $project: {
                                fields: { $objectToArray: "$$ROOT" },
                            },
                        },
                        { $unwind: "$fields" },
                        {
                            $group: {
                                _id: {
                                    field: "$fields.k",
                                    type: { $type: "$fields.v" },
                                },
                                count: { $sum: 1 },
                                examples: { $push: "$fields.v" },
                            },
                        },
                        { $sort: { "_id.field": 1, count: -1 } },
                    ],
                    totalDocs: [{ $count: "count" }],
                },
            },
        ])
        .toArray();

    const results = fieldAnalysis[0];
    const fieldTypes = results.fieldTypes || [];
    const totalDocs = results.totalDocs[0]?.count || documentCount;

    // Group by field (handling nested paths)
    const fieldMap = new Map<string, FieldTypeInfo>();

    for (const fieldAnalysisResult of fieldTypes) {
        const { _id, count, examples } = fieldAnalysisResult;
        const key = `${_id.field}`;

        if (!fieldMap.has(key)) {
            fieldMap.set(key, {
                fieldPath: key,
                mongoType: _id.type,
                documentCount: count,
                exampleValues: examples.slice(0, 3),
            });
        }
    }

    // Check for violations
    const violations: TypeViolation[] = [];
    const documentedSchema = getCollectionSchema(collectionName);
    const isDocumented = getAllDefinedCollections().includes(collectionName);

    for (const [fieldPath, fieldInfo] of fieldMap) {
        const validation = validateFieldType(
            collectionName,
            fieldPath,
            fieldInfo.mongoType,
        );

        if (!validation.isValid) {
            violations.push({
                fieldPath,
                expectedType: validation.expected,
                actualType: validation.actual,
                affectedDocuments: fieldInfo.documentCount,
                violationType: "type_mismatch",
                severity:
                    fieldPath.includes("lastDailyClaimAt") ||
                    fieldPath.includes("updatedAt") ||
                    fieldPath.includes("createdAt")
                        ? "critical"
                        : fieldPath.includes("version")
                          ? "warning"
                          : "info",
                examples: fieldInfo.exampleValues,
            });
        } else if (!documentedSchema[fieldPath] && isDocumented) {
            violations.push({
                fieldPath,
                expectedType: "unknown",
                actualType: fieldInfo.mongoType,
                affectedDocuments: fieldInfo.documentCount,
                violationType: "undocumented_field",
                severity: "info",
                examples: fieldInfo.exampleValues,
            });
        }
    }

    return {
        collectionName,
        documentCount: totalDocs,
        fields: Array.from(fieldMap.values()),
        violations,
        isDocumented,
    };
}

/**
 * Analyze entire database for type violations
 */
export async function analyzeDatabaseSchema(
    db: Db,
): Promise<DatabaseAnalysisReport> {
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map((c) => c.name);

    const analysisResults: CollectionTypeAnalysis[] = [];
    let totalViolations = 0;
    const violationsBySeverity = { critical: 0, warning: 0, info: 0 };

    console.log(`\n📊 Analyzing ${collectionNames.length} collections...`);

    for (const collectionName of collectionNames) {
        // Skip system collections
        if (collectionName.startsWith("system.")) continue;

        console.log(`  Scanning ${collectionName}...`);
        const analysis = await analyzeCollection(db, collectionName);
        analysisResults.push(analysis);

        totalViolations += analysis.violations.length;
        for (const violation of analysis.violations) {
            violationsBySeverity[violation.severity]++;
        }
    }

    // Identify undocumented collections
    const documentedCollections = getAllDefinedCollections();
    const undocumentedCollections = collectionNames.filter(
        (name) =>
            !name.startsWith("system.") &&
            !documentedCollections.includes(name),
    );

    // Generate recommendations
    const recommendations: string[] = [];

    if (violationsBySeverity.critical > 0) {
        recommendations.push(
            `🔴 CRITICAL: ${violationsBySeverity.critical} critical type violations found (timestamps/versions as double)`,
        );
    }

    if (violationsBySeverity.warning > 0) {
        recommendations.push(
            `🟡 WARNING: ${violationsBySeverity.warning} warning violations found (versions with wrong types)`,
        );
    }

    if (undocumentedCollections.length > 0) {
        recommendations.push(
            `📋 INFO: ${undocumentedCollections.length} undocumented collections detected - add to mongodbSchemaRegistry`,
        );
    }

    // Check for missing field documentation
    const missingFieldCount = analysisResults.reduce(
        (sum, analysis) =>
            sum +
            analysis.violations.filter(
                (v) => v.violationType === "undocumented_field",
            ).length,
        0,
    );

    if (missingFieldCount > 0) {
        recommendations.push(
            `📝 INFO: ${missingFieldCount} undocumented fields found in known collections`,
        );
    }

    return {
        timestamp: Date.now(),
        totalCollections: collectionNames.length,
        documentedCollections: collectionNames.filter((c) =>
            documentedCollections.includes(c),
        ).length,
        undocumentedCollections,
        analysisPerCollection: analysisResults,
        totalViolations,
        violationsBySeverity,
        recommendations,
    };
}

/**
 * Generate human-readable report
 */
export function formatAnalysisReport(report: DatabaseAnalysisReport): string {
    let output = `\n${"=".repeat(80)}\n`;
    output += `MongoDB Database Schema Analysis Report\n`;
    output += `Generated: ${new Date(report.timestamp).toISOString()}\n`;
    output += `${"=".repeat(80)}\n\n`;

    // Summary
    output += `📊 SUMMARY\n`;
    output += `  Total Collections: ${report.totalCollections}\n`;
    output += `  Documented: ${report.documentedCollections}\n`;
    output += `  Undocumented: ${report.undocumentedCollections.length}\n`;
    output += `  Total Violations: ${report.totalViolations}\n`;
    output += `    🔴 Critical: ${report.violationsBySeverity.critical}\n`;
    output += `    🟡 Warning:  ${report.violationsBySeverity.warning}\n`;
    output += `    🔵 Info:     ${report.violationsBySeverity.info}\n\n`;

    // Violations by collection
    output += `⚠️  VIOLATIONS BY COLLECTION\n`;
    for (const analysis of report.analysisPerCollection) {
        if (analysis.violations.length > 0) {
            output += `\n  📦 ${analysis.collectionName} (${analysis.documentCount} docs)\n`;
            for (const violation of analysis.violations) {
                const icon =
                    violation.severity === "critical"
                        ? "🔴"
                        : violation.severity === "warning"
                          ? "🟡"
                          : "🔵";
                output += `    ${icon} ${violation.fieldPath}\n`;
                output += `       Expected: ${violation.expectedType}\n`;
                output += `       Actual: ${violation.actualType}\n`;
                output += `       Affected: ${violation.affectedDocuments} docs\n`;
            }
        }
    }

    // Undocumented collections
    if (report.undocumentedCollections.length > 0) {
        output += `\n📋 UNDOCUMENTED COLLECTIONS\n`;
        for (const collection of report.undocumentedCollections) {
            output += `  ⚠️  ${collection}\n`;
        }
        output += `\n  Add these to mongodbSchemaRegistry.ts\n`;
    }

    // Recommendations
    if (report.recommendations.length > 0) {
        output += `\n💡 RECOMMENDATIONS\n`;
        for (const rec of report.recommendations) {
            output += `  • ${rec}\n`;
        }
    }

    output += `\n${"=".repeat(80)}\n`;

    return output;
}

/**
 * Export report as JSON for programmatic use
 */
export function exportAnalysisReport(report: DatabaseAnalysisReport): string {
    return JSON.stringify(report, null, 2);
}

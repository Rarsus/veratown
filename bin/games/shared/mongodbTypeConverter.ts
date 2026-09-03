/*
 * MongoDB Type Converter
 *
 * Bulk converts incorrect numeric types across all collections.
 * Uses the schema registry to know which fields need fixing.
 *
 * Conversions:
 * - double → long for timestamp fields
 * - double → int for version and counter fields
 * - NaN values → 0
 */

import { Db } from "mongodb";
import {
    getCollectionSchema,
    getTimestampFields,
    getVersionFields,
    getIntegerFields,
} from "./mongodbSchemaRegistry";

export interface ConversionResult {
    collectionName: string;
    field: string;
    targetType: "long" | "int";
    documentsAffected: number;
    successCount: number;
    errorCount: number;
    errors: string[];
}

export interface ConversionReport {
    timestamp: number;
    totalCollections: number;
    totalFields: number;
    totalDocumentsAffected: number;
    results: ConversionResult[];
    errors: string[];
}

/**
 * Convert double to long for a specific timestamp field
 */
export async function convertDoubleToLong(
    db: Db,
    collectionName: string,
    fieldPath: string,
): Promise<ConversionResult> {
    const collection = db.collection(collectionName);
    const errors: string[] = [];

    try {
        // Count affected documents
        const affectedCount = await collection.countDocuments({
            [fieldPath]: { $type: "double" },
        });

        if (affectedCount === 0) {
            return {
                collectionName,
                field: fieldPath,
                targetType: "long",
                documentsAffected: 0,
                successCount: 0,
                errorCount: 0,
                errors: [],
            };
        }

        console.log(
            `    Converting ${fieldPath}: ${affectedCount} documents...`,
        );

        // Convert using aggregation pipeline
        const result = await collection.updateMany(
            { [fieldPath]: { $type: "double" } },
            [
                {
                    $set: {
                        [fieldPath]: { $toLong: `$${fieldPath}` },
                    },
                },
            ],
        );

        return {
            collectionName,
            field: fieldPath,
            targetType: "long",
            documentsAffected: affectedCount,
            successCount: result.modifiedCount,
            errorCount: 0,
            errors,
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(errorMsg);
        return {
            collectionName,
            field: fieldPath,
            targetType: "long",
            documentsAffected: 0,
            successCount: 0,
            errorCount: 1,
            errors,
        };
    }
}

/**
 * Convert double to int for a specific field (with error handling for NaN)
 */
export async function convertDoubleToInt(
    db: Db,
    collectionName: string,
    fieldPath: string,
): Promise<ConversionResult> {
    const collection = db.collection(collectionName);
    const errors: string[] = [];

    try {
        // Count affected documents
        const affectedCount = await collection.countDocuments({
            [fieldPath]: { $type: "double" },
        });

        if (affectedCount === 0) {
            return {
                collectionName,
                field: fieldPath,
                targetType: "int",
                documentsAffected: 0,
                successCount: 0,
                errorCount: 0,
                errors: [],
            };
        }

        console.log(
            `    Converting ${fieldPath}: ${affectedCount} documents...`,
        );

        // Convert with error handling for NaN
        const result = await collection.updateMany(
            { [fieldPath]: { $type: "double" } },
            [
                {
                    $set: {
                        [fieldPath]: {
                            $convert: {
                                input: `$${fieldPath}`,
                                to: "int",
                                onError: 0,
                            },
                        },
                    },
                },
            ],
        );

        return {
            collectionName,
            field: fieldPath,
            targetType: "int",
            documentsAffected: affectedCount,
            successCount: result.modifiedCount,
            errorCount: 0,
            errors,
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(errorMsg);
        return {
            collectionName,
            field: fieldPath,
            targetType: "int",
            documentsAffected: 0,
            successCount: 0,
            errorCount: 1,
            errors,
        };
    }
}

/**
 * Convert all double types in a collection to their correct types
 */
export async function convertCollectionTypes(
    db: Db,
    collectionName: string,
): Promise<ConversionResult[]> {
    const schema = getCollectionSchema(collectionName);

    if (Object.keys(schema).length === 0) {
        console.log(
            `  ⚠️  Collection ${collectionName} not in schema registry, skipping`,
        );
        return [];
    }

    console.log(`\n  📦 Processing ${collectionName}...`);

    const results: ConversionResult[] = [];

    // Convert timestamps
    const timestampFields = getTimestampFields(collectionName);
    for (const field of timestampFields) {
        const result = await convertDoubleToLong(db, collectionName, field);
        if (result.documentsAffected > 0) {
            results.push(result);
        }
    }

    // Convert versions and integers
    const integerFields = getIntegerFields(collectionName);
    for (const field of integerFields) {
        const result = await convertDoubleToInt(db, collectionName, field);
        if (result.documentsAffected > 0) {
            results.push(result);
        }
    }

    return results;
}

/**
 * Convert all collections in the database
 */
export async function convertAllCollections(db: Db): Promise<ConversionReport> {
    console.log("\n🔄 Starting type conversions...\n");

    const collections = await db.listCollections().toArray();
    const collectionNames = collections
        .map((c) => c.name)
        .filter((c) => !c.startsWith("system."));

    const allResults: ConversionResult[] = [];
    const errors: string[] = [];
    let totalDocumentsAffected = 0;

    for (const collectionName of collectionNames) {
        try {
            const results = await convertCollectionTypes(db, collectionName);
            allResults.push(...results);
            totalDocumentsAffected += results.reduce(
                (sum, r) => sum + r.documentsAffected,
                0,
            );
        } catch (error) {
            const errorMsg = `Error processing ${collectionName}: ${error instanceof Error ? error.message : String(error)}`;
            errors.push(errorMsg);
            console.error(`  ❌ ${errorMsg}`);
        }
    }

    return {
        timestamp: Date.now(),
        totalCollections: collectionNames.length,
        totalFields: allResults.length,
        totalDocumentsAffected,
        results: allResults,
        errors,
    };
}

/**
 * Format conversion report for display
 */
export function formatConversionReport(report: ConversionReport): string {
    let output = `\n${"=".repeat(80)}\n`;
    output += `MongoDB Type Conversion Report\n`;
    output += `Generated: ${new Date(report.timestamp).toISOString()}\n`;
    output += `${"=".repeat(80)}\n\n`;

    output += `📊 SUMMARY\n`;
    output += `  Collections Processed: ${report.totalCollections}\n`;
    output += `  Fields Converted: ${report.totalFields}\n`;
    output += `  Total Documents Affected: ${report.totalDocumentsAffected}\n`;

    if (report.errors.length > 0) {
        output += `  Errors: ${report.errors.length}\n\n`;
        output += `⚠️  ERRORS\n`;
        for (const error of report.errors) {
            output += `  • ${error}\n`;
        }
    }

    output += `\n✅ CONVERSIONS\n`;
    const resultsByCollection = new Map<string, ConversionResult[]>();
    for (const result of report.results) {
        if (!resultsByCollection.has(result.collectionName)) {
            resultsByCollection.set(result.collectionName, []);
        }
        resultsByCollection.get(result.collectionName)!.push(result);
    }

    for (const [collectionName, results] of resultsByCollection) {
        output += `\n  📦 ${collectionName}\n`;
        for (const result of results) {
            const icon = result.errorCount > 0 ? "❌" : "✅";
            output += `    ${icon} ${result.field} → ${result.targetType}\n`;
            output += `       Modified: ${result.successCount}/${result.documentsAffected} documents\n`;
            if (result.errors.length > 0) {
                output += `       Errors: ${result.errors.join(", ")}\n`;
            }
        }
    }

    output += `\n${"=".repeat(80)}\n`;

    return output;
}

/**
 * Export report as JSON
 */
export function exportConversionReport(report: ConversionReport): string {
    return JSON.stringify(report, null, 2);
}

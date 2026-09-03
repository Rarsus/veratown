/*
 * MongoDB Interface Generator
 *
 * Automatically generates TypeScript interface definitions from the schema registry.
 * This ensures TypeScript types match the database schema exactly.
 *
 * Generated interfaces enforce:
 * - Correct field names and types
 * - Required vs optional fields
 * - Nested object structures
 * - Documentation through JSDoc comments
 */

import {
    getAllDefinedCollections,
    getCollectionSchema,
    FieldType,
} from "./mongodbSchemaRegistry";

interface GeneratedField {
    name: string;
    tsType: string;
    required: boolean;
    description?: string;
    mongoType: FieldType;
}

interface GeneratedInterface {
    name: string;
    fields: GeneratedField[];
    documentation: string;
}

/**
 * Convert MongoDB field type to TypeScript type
 */
function mongoTypeToTsType(fieldType: FieldType): string {
    switch (fieldType) {
        case "timestamp":
            return "number"; // Branded as Timestamp in runtime
        case "version":
            return "number"; // Branded as Version in runtime
        case "int":
            return "number";
        case "double":
            return "number";
        case "string":
            return "string";
        case "boolean":
            return "boolean";
        case "array":
            return "unknown[]"; // Generic array
        case "object":
            return "Record<string, unknown>";
        default:
            return "unknown";
    }
}

/**
 * Generate TypeScript interface for a single collection
 */
function generateCollectionInterface(
    collectionName: string,
): GeneratedInterface {
    const schema = getCollectionSchema(collectionName);
    const fields: GeneratedField[] = [];

    // Group fields by nesting level for better organization
    const topLevelFields: GeneratedField[] = [];
    const nestedByPrefix = new Map<string, GeneratedField[]>();

    for (const [fieldPath, fieldSchema] of Object.entries(schema)) {
        const tsType = mongoTypeToTsType(fieldSchema.type);
        const field: GeneratedField = {
            name: fieldPath,
            tsType,
            required: fieldSchema.required ?? false,
            description: fieldSchema.description,
            mongoType: fieldSchema.type,
        };

        if (fieldPath.includes(".")) {
            const prefix = fieldPath.split(".")[0];
            if (!nestedByPrefix.has(prefix)) {
                nestedByPrefix.set(prefix, []);
            }
            nestedByPrefix.get(prefix)!.push(field);
        } else {
            topLevelFields.push(field);
        }
    }

    fields.push(...topLevelFields);
    for (const [, nestedFields] of nestedByPrefix) {
        fields.push(...nestedFields);
    }

    // Create interface name (PascalCase)
    const interfaceName =
        collectionName.charAt(0).toUpperCase() +
        collectionName
            .slice(1)
            .replace(/([A-Z])/g, "$1")
            .replace(/_/g, "");

    return {
        name: interfaceName,
        fields,
        documentation: `Interface for ${collectionName} collection`,
    };
}

/**
 * Generate nested object type for grouped fields
 */
function generateNestedType(prefix: string, fields: GeneratedField[]): string {
    const nestedFields = fields.filter((f) => f.name.startsWith(prefix + "."));
    const nestedTypeName =
        prefix.charAt(0).toUpperCase() + prefix.slice(1) + "State";

    let output = `export interface ${nestedTypeName} {\n`;

    for (const field of nestedFields) {
        const shortName = field.name.substring(prefix.length + 1);
        const optional = field.required ? "" : "?";

        if (field.description) {
            output += `  /** ${field.description} */\n`;
        }

        output += `  ${shortName}${optional}: ${field.tsType};\n`;
    }

    output += `}\n\n`;
    return output;
}

/**
 * Generate TypeScript code for an interface with JSDoc
 */
function generateInterfaceCode(generated: GeneratedInterface): string {
    let code = `/**\n`;
    code += ` * ${generated.documentation}\n`;
    code += ` * \n`;
    code += ` * Auto-generated from mongodbSchemaRegistry.\n`;
    code += ` * DO NOT edit manually - update the registry instead.\n`;
    code += ` */\n`;

    // Group fields by nesting level
    const topLevelFields: GeneratedField[] = [];
    const nestedByPrefix = new Map<string, GeneratedField[]>();

    for (const field of generated.fields) {
        if (field.name.includes(".")) {
            const prefix = field.name.split(".")[0];
            if (!nestedByPrefix.has(prefix)) {
                nestedByPrefix.set(prefix, []);
            }
            nestedByPrefix.get(prefix)!.push(field);
        } else {
            topLevelFields.push(field);
        }
    }

    // Generate nested interfaces first
    for (const [prefix, nestedFields] of nestedByPrefix) {
        const nestedTypeName =
            prefix.charAt(0).toUpperCase() + prefix.slice(1) + "State";

        code += `export interface ${nestedTypeName} {\n`;

        for (const field of nestedFields) {
            const shortName = field.name.substring(prefix.length + 1);
            const optional = field.required ? "" : "?";

            if (field.description) {
                code += `  /** ${field.description} (MongoDB type: ${field.mongoType}) */\n`;
            }

            const comment =
                field.mongoType === "timestamp" ? " // Use asTimestamp()" : "";
            const versionComment =
                field.mongoType === "version" ? " // Use asVersion()" : "";

            code += `  ${shortName}${optional}: ${field.tsType};${comment}${versionComment}\n`;
        }

        code += `}\n\n`;
    }

    // Generate main interface
    code += `export interface ${generated.name} {\n`;

    // Add top-level fields
    for (const field of topLevelFields) {
        if (field.description) {
            code += `  /** ${field.description} (MongoDB type: ${field.mongoType}) */\n`;
        }

        const optional = field.required ? "" : "?";
        const comment =
            field.mongoType === "timestamp" ? " // Use asTimestamp()" : "";
        const versionComment =
            field.mongoType === "version" ? " // Use asVersion()" : "";

        code += `  ${field.name}${optional}: ${field.tsType};${comment}${versionComment}\n`;
    }

    // Add nested object fields
    for (const [prefix] of nestedByPrefix) {
        const nestedTypeName =
            prefix.charAt(0).toUpperCase() + prefix.slice(1) + "State";

        code += `  /** ${prefix} system state */\n`;
        code += `  ${prefix}: ${nestedTypeName};\n`;
    }

    code += `}\n`;

    return code;
}

/**
 * Generate type guards for runtime validation
 */
function generateTypeGuards(
    collectionName: string,
    interfaceName: string,
): string {
    let code = `\n/**\n`;
    code += ` * Type guard for ${interfaceName}\n`;
    code += ` */\n`;
    code += `export function is${interfaceName}(obj: unknown): obj is ${interfaceName} {\n`;
    code += `  if (typeof obj !== "object" || obj === null) return false;\n`;
    code += `  const doc = obj as Record<string, unknown>;\n`;
    code += `  return typeof doc._id === "number"; // Basic check\n`;
    code += `}\n`;

    return code;
}

/**
 * Generate all collection interfaces
 */
export function generateAllInterfaces(): string {
    const collections = getAllDefinedCollections();
    let output = `/*\n`;
    output += ` * Auto-Generated MongoDB Collection Interfaces\n`;
    output += ` * \n`;
    output += ` * These interfaces are generated from mongodbSchemaRegistry.ts\n`;
    output += ` * to ensure TypeScript types match the database schema exactly.\n`;
    output += ` * \n`;
    output += ` * DO NOT edit this file manually.\n`;
    output += ` * Instead, update mongodbSchemaRegistry.ts and regenerate.\n`;
    output += ` */\n\n`;

    for (const collectionName of collections) {
        const generated = generateCollectionInterface(collectionName);
        output += generateInterfaceCode(generated);
        output += generateTypeGuards(collectionName, generated.name);
        output += "\n";
    }

    return output;
}

/**
 * Generate schema documentation in Markdown
 */
export function generateSchemaDocumentation(): string {
    const collections = getAllDefinedCollections();
    let markdown = `# MongoDB Schema Reference\n\n`;
    markdown += `Auto-generated from \`mongodbSchemaRegistry.ts\`\n\n`;

    for (const collectionName of collections) {
        const schema = getCollectionSchema(collectionName);
        const fieldCount = Object.keys(schema).length;

        markdown += `## ${collectionName}\n\n`;
        markdown += `**Fields:** ${fieldCount}\n\n`;

        markdown += `| Field | Type | Required | Description |\n`;
        markdown += `|-------|------|----------|-------------|\n`;

        for (const [fieldPath, fieldSchema] of Object.entries(schema)) {
            const required = fieldSchema.required ? "✅" : "❌";
            const desc = fieldSchema.description || "";
            markdown += `| \`${fieldPath}\` | \`${fieldSchema.type}\` | ${required} | ${desc} |\n`;
        }

        markdown += `\n`;
    }

    return markdown;
}

/**
 * Get count of interfaces that need to be generated
 */
export function getInterfaceCount(): number {
    return getAllDefinedCollections().length;
}

/**
 * Get list of interfaces to be generated
 */
export function listGeneratedInterfaces(): string[] {
    const collections = getAllDefinedCollections();
    return collections.map((c) => {
        const name =
            c.charAt(0).toUpperCase() +
            c
                .slice(1)
                .replace(/([A-Z])/g, "$1")
                .replace(/_/g, "");
        return name;
    });
}

#!/usr/bin/env npx tsx
/*
 * Database Type Safety CLI
 *
 * Comprehensive tool for managing MongoDB schema types across all collections.
 *
 * Usage:
 *   npx tsx scripts/database-type-safety.ts analyze      - Scan database for type violations
 *   npx tsx scripts/database-type-safety.ts convert      - Fix all type violations
 *   npx tsx scripts/database-type-safety.ts generate     - Generate TypeScript interfaces
 *   npx tsx scripts/database-type-safety.ts docs         - Generate schema documentation
 */

import { MongoClient } from "mongodb";
import * as fs from "fs";
import {
    analyzeDatabaseSchema,
    formatAnalysisReport,
    exportAnalysisReport,
} from "../bin/games/shared/mongodbInspector";
import {
    convertAllCollections,
    formatConversionReport,
    exportConversionReport,
} from "../bin/games/shared/mongodbTypeConverter";
import {
    generateAllInterfaces,
    generateSchemaDocumentation,
    listGeneratedInterfaces,
} from "../bin/games/shared/mongodbInterfaceGenerator";

async function main() {
    const command = process.argv[2] || "help";

    try {
        switch (command) {
            case "analyze":
                await analyzeDatabase();
                break;

            case "convert":
                await convertDatabase();
                break;

            case "generate":
                generateInterfaces();
                break;

            case "docs":
                generateDocs();
                break;

            case "help":
            default:
                printHelp();
        }
    } catch (error) {
        console.error(
            "❌ Error:",
            error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
    }
}

async function analyzeDatabase() {
    console.log("📊 Analyzing database schema...\n");

    const configPath = "./config.json";
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    const client = new MongoClient(config.mongo_uri, { tls: config.mongo_tls });

    try {
        await client.connect();
        const db = client.db(config.mongo_db);

        const report = await analyzeDatabaseSchema(db);
        console.log(formatAnalysisReport(report));

        // Also save JSON report
        const reportPath = `./reports/schema-analysis-${Date.now()}.json`;
        const reportsDir = "./reports";
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }
        fs.writeFileSync(reportPath, exportAnalysisReport(report));
        console.log(`\n📁 Full report saved to: ${reportPath}`);
    } finally {
        await client.close();
    }
}

async function convertDatabase() {
    console.log("🔄 Converting all database types...\n");

    const configPath = "./config.json";
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    const client = new MongoClient(config.mongo_uri, { tls: config.mongo_tls });

    try {
        await client.connect();
        const db = client.db(config.mongo_db);

        const report = await convertAllCollections(db);
        console.log(formatConversionReport(report));

        // Also save JSON report
        const reportPath = `./reports/conversion-report-${Date.now()}.json`;
        const reportsDir = "./reports";
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }
        fs.writeFileSync(reportPath, exportConversionReport(report));
        console.log(`\n📁 Full report saved to: ${reportPath}`);
    } finally {
        await client.close();
    }
}

function generateInterfaces() {
    console.log("📝 Generating TypeScript interfaces...\n");

    const interfaceCount = listGeneratedInterfaces().length;
    console.log(`   Interfaces to generate: ${interfaceCount}`);
    console.log(`   • ${listGeneratedInterfaces().join("\n   • ")}\n`);

    const code = generateAllInterfaces();

    const outputPath = "./bin/games/shared/mongodbGeneratedInterfaces.ts";
    fs.writeFileSync(outputPath, code);

    console.log(`✅ Interfaces generated: ${outputPath}`);
    console.log(`\n📚 To use in your code:\n`);
    console.log(
        `   import { UnifiedcharacterProfiles } from "./mongodbGeneratedInterfaces";\n`,
    );
}

function generateDocs() {
    console.log("📖 Generating schema documentation...\n");

    const markdown = generateSchemaDocumentation();

    const outputPath = "./docs/MONGODB_SCHEMA_REFERENCE.md";
    const docsDir = "./docs";
    if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, markdown);

    console.log(`✅ Schema documentation generated: ${outputPath}`);
    console.log(
        `\n📖 Open with your markdown viewer to see the full reference\n`,
    );
}

function printHelp() {
    console.log(`
🗄️  Database Type Safety Management Tool

Usage:
  npx tsx scripts/database-type-safety.ts <command>

Commands:
  analyze    - Scan database and report type violations
  convert    - Fix all type violations in database
  generate   - Generate TypeScript interfaces from schema
  docs       - Generate markdown schema documentation
  help       - Show this help message

Examples:
  # Check for type violations
  npx tsx scripts/database-type-safety.ts analyze

  # Fix all violations (requires confirmation)
  npx tsx scripts/database-type-safety.ts convert

  # Generate TypeScript interfaces
  npx tsx scripts/database-type-safety.ts generate

  # Generate schema docs
  npx tsx scripts/database-type-safety.ts docs

Reports:
  All reports are saved to ./reports/ with timestamps for tracking history.

Configuration:
  Reads database connection from ./config.json
  Uses mongodschemaRegistry.ts for type specifications

Schema Updates:
  Edit bin/games/shared/mongodbSchemaRegistry.ts to:
  1. Add new collections
  2. Document new fields
  3. Specify field types (timestamp, version, int, etc.)

Then run:
  npx tsx scripts/database-type-safety.ts generate
  
To update TypeScript interfaces automatically.
`);
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});

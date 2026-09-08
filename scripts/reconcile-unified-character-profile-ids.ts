#!/usr/bin/env node

import { MongoClient } from "mongodb";
import { UnifiedCharacterStore } from "../bin/games/shared/unifiedCharacterStore";

async function main(): Promise<void> {
    const args = new Set(process.argv.slice(2));
    const apply = args.has("--apply");
    const approved = args.has("--approve-cleanup");
    if (apply && !approved) {
        throw new Error(
            "Refusing cleanup without --approve-cleanup. Run without --apply to review first.",
        );
    }

    const client = new MongoClient(
        process.env.MONGODB_URI ?? "mongodb://localhost:27017",
    );
    await client.connect();
    try {
        const store = new UnifiedCharacterStore(
            client.db(process.env.MONGODB_DB ?? "ropeybot"),
        );
        const before = await store.getProfileIdIntegrityReport();
        console.log(JSON.stringify({ phase: "before", ...before }, null, 2));
        if (!apply) {
            if (
                before.malformedProfileIds.length ||
                before.duplicateLogicalMemberNumbers.length
            ) {
                process.exitCode = 1;
            }
            return;
        }

        const repairs = await store.repairMalformedProfileIds(true);
        console.log(JSON.stringify({ repairs }, null, 2));
        const after = await store.getProfileIdIntegrityReport();
        console.log(JSON.stringify({ phase: "after", ...after }, null, 2));
        if (
            after.malformedProfileIds.length ||
            after.duplicateLogicalMemberNumbers.length
        ) {
            process.exitCode = 1;
        }
    } finally {
        await client.close();
    }
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});

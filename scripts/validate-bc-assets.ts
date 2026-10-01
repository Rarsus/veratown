import { AssetFemale3DCG } from "../src/bcdata/Female3DCG.js";
import { getExtendedAssetDef } from "bc-bot";

const extendedAssets: string[] = [];
const missingDefinitions: string[] = [];

for (const group of AssetFemale3DCG) {
    for (const asset of group.Asset ?? []) {
        if (typeof asset === "string" || !asset.Extended) continue;

        const identity = `${group.Group}/${asset.Name}`;
        extendedAssets.push(identity);
        if (!getExtendedAssetDef({ Group: group.Group, Name: asset.Name })) {
            missingDefinitions.push(identity);
        }
    }
}

if (missingDefinitions.length > 0) {
    process.stderr.write(
        [
            "Generated bc-bot asset registry is incomplete:",
            ...missingDefinitions.map((identity) => `- ${identity}`),
        ].join("\n") + "\n",
    );
    process.exitCode = 1;
} else {
    process.stdout.write(
        `Validated ${extendedAssets.length} extended BC asset definitions.\n`,
    );
}

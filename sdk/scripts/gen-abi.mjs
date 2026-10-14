// Regenerates src/abi.ts from the Foundry build artifact.
// Run `forge build` in ../contracts first, then `npm run abi`.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const artifact = resolve(here, "../../contracts/out/ChitCircle.sol/ChitCircle.json");
const target = resolve(here, "../src/abi.ts");

if (!existsSync(artifact)) {
  console.error(`No artifact at ${artifact}\nRun: cd ../contracts && forge build`);
  process.exit(1);
}

const { abi } = JSON.parse(readFileSync(artifact, "utf8"));
writeFileSync(
  target,
  `// SPDX-License-Identifier: MIT
// AUTO-GENERATED from contracts/out/ChitCircle.sol/ChitCircle.json
// Regenerate with: npm run abi   (from sdk/)
// Do not hand-edit.

export const chitCircleAbi = ${JSON.stringify(abi, null, 2)} as const;
`,
);
console.log(`Wrote ${target} (${abi.length} entries)`);

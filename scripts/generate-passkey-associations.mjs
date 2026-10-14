import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const rpId = process.env.EXPO_PUBLIC_MERA_RP_ID?.trim();
const bundleId = process.env.EXPO_PUBLIC_IOS_BUNDLE_ID || "com.chitcircle.app";
const androidPackage = process.env.EXPO_PUBLIC_ANDROID_PACKAGE || "com.chitcircle.app";
const teamId = process.env.IOS_TEAM_ID?.trim();
const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!rpId || !/^[a-z0-9.-]+$/i.test(rpId) || !rpId.includes(".")) {
  throw new Error("Set EXPO_PUBLIC_MERA_RP_ID in .env to a hostname you control.");
}
if (!teamId && fingerprints.length === 0) {
  throw new Error("Set IOS_TEAM_ID or ANDROID_SHA256_CERT_FINGERPRINTS in .env.");
}

const outputDirectory = join("public", ".well-known");
await mkdir(outputDirectory, { recursive: true });

if (teamId) {
  const association = {
    webcredentials: {
      apps: [`${teamId}.${bundleId}`],
    },
  };
  await writeFile(join(outputDirectory, "apple-app-site-association"), `${JSON.stringify(association, null, 2)}\n`);
  console.log(`Wrote ${outputDirectory}/apple-app-site-association`);
}

if (fingerprints.length > 0) {
  const association = [{
    relation: ["delegate_permission/common.get_login_creds"],
    target: {
      namespace: "android_app",
      package_name: androidPackage,
      sha256_cert_fingerprints: fingerprints,
    },
  }];
  await writeFile(join(outputDirectory, "assetlinks.json"), `${JSON.stringify(association, null, 2)}\n`);
  console.log(`Wrote ${outputDirectory}/assetlinks.json`);
}

console.log(`Publish the generated files at https://${rpId}/.well-known/ with no redirects.`);
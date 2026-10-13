import type { ExpoConfig } from "expo/config";

const rpId = process.env.EXPO_PUBLIC_MERA_RP_ID?.trim() ?? "";
const bundleId = process.env.EXPO_PUBLIC_IOS_BUNDLE_ID || "com.chitcircle.app";
const androidPackage = process.env.EXPO_PUBLIC_ANDROID_PACKAGE || "com.chitcircle.app";

const config: ExpoConfig = {
  name: "Chit Circle",
  slug: "chit-circle",
  scheme: "chitcircle",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: bundleId,
    associatedDomains: rpId ? [`webcredentials:${rpId}`] : [],
  },
  android: {
    package: androidPackage,
  },
  plugins: ["expo-secure-store"],
  extra: {
    meraRpId: rpId,
  },
};

export default config;
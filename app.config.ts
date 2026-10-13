import type { ExpoConfig } from "expo/config";

const rpId = process.env.EXPO_PUBLIC_MERA_RP_ID?.trim() ?? "";
const bundleId = process.env.EXPO_PUBLIC_IOS_BUNDLE_ID || "com.chitcircle.app";
const androidPackage = process.env.EXPO_PUBLIC_ANDROID_PACKAGE || "com.chitcircle.app";

/** The logo's background cream, so the splash and icon padding match the art. */
const BRAND_BACKGROUND = "#FDFCFA";

const config: ExpoConfig = {
  name: "Chit Circle",
  slug: "chit-circle",
  scheme: "chitcircle",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  // The icon is the mark without the wordmark: "Chit Circle" is unreadable at
  // icon size, and both platforms print the app name under the icon anyway.
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: BRAND_BACKGROUND,
  },
  ios: {
    bundleIdentifier: bundleId,
    associatedDomains: rpId ? [`webcredentials:${rpId}`] : [],
  },
  android: {
    package: androidPackage,
    // Android masks the foreground, so adaptive-icon.png keeps the mark inside
    // the central safe zone and is the one asset that stays transparent.
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: BRAND_BACKGROUND,
    },
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: ["expo-secure-store"],
  extra: {
    meraRpId: rpId,
  },
};

export default config;
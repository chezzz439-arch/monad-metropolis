const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

/**
 * Force every `react` import to the app's copy.
 *
 * The SDK declares React itself so its tests and typecheck can run standalone,
 * which leaves a real `sdk/node_modules/react` on disk. Metro resolves from the
 * importing file outwards, so `sdk/src/hooks.ts` got that copy while the screens
 * got the root one — two Reacts in one tree, and the second one's hook
 * dispatcher is null. Every SDK hook then threw "Cannot read properties of null
 * (reading 'useContext')" on first render, which is the moment the app shows a
 * signed-in screen. Blank page, no stack worth reading.
 *
 * Re-resolving from the project root rather than naming a path keeps this
 * working whether or not npm chose to hoist.
 */
const rootOrigin = path.join(__dirname, "index.js");

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isReact =
    moduleName === "react" ||
    moduleName === "react-dom" ||
    moduleName.startsWith("react/") ||
    moduleName.startsWith("react-dom/");

  return context.resolveRequest(
    isReact ? { ...context, originModulePath: rootOrigin } : context,
    moduleName,
    platform,
  );
};

module.exports = config;

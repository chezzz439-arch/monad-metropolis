import { SafeAreaProvider } from "react-native-safe-area-context";
import { ConfiguredApp } from "./app/ConfiguredApp";
import { configuredDeployment } from "./app/config/deployment";
import { monadTestnet } from "./sdk/src/index";
import { Gallery, galleryTarget } from "./app/gallery/Gallery";

/**
 * `configuredDeployment` is null only when an override in the environment is
 * malformed. The live deployment is baked into the SDK, so falling back to it
 * means a bad `.env` degrades to the shipped contract rather than to a screen
 * that cannot do anything.
 */
export default function App() {
  const gallery = galleryTarget();
  return (
    <SafeAreaProvider>
      {gallery ? (
        <Gallery screen={gallery} />
      ) : (
        <ConfiguredApp deployment={configuredDeployment ?? monadTestnet} />
      )}
    </SafeAreaProvider>
  );
}

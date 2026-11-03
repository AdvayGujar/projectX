import type { ReactElement } from "react";

import { PlaceholderScreen } from "../src/screens/PlaceholderScreen";

export default function SettingsRoute(): ReactElement {
  return (
    <PlaceholderScreen
      title="Settings"
      body="Providers and keys, default models, memory, storage and privacy. Keys never leave the keychain."
    />
  );
}

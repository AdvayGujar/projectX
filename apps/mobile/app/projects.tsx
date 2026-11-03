import type { ReactElement } from "react";

import { PlaceholderScreen } from "../src/screens/PlaceholderScreen";

export default function ProjectsRoute(): ReactElement {
  return (
    <PlaceholderScreen
      title="Projects"
      body="Projects hold sessions, files, memory and artifacts. Arriving with the project repository."
    />
  );
}

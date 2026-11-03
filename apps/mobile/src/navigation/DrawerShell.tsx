import type { DrawerDestination } from "@projectx/ui";
import { DrawerContent } from "@projectx/ui";
import { useRouter } from "expo-router";
import type { ReactElement } from "react";
import { useState } from "react";

import { RECENT_SESSIONS } from "../fixtures/session";

/**
 * Structural subset of the drawer content props. Expo Router vendors its own React
 * Navigation build, so importing `DrawerContentComponentProps` from the published package
 * compares two unrelated copies of the same type.
 */
export interface DrawerShellProps {
  readonly state: {
    readonly index: number;
    readonly routeNames: readonly string[];
  };
  readonly navigation: {
    readonly closeDrawer: () => void;
  };
}

const DESTINATIONS: readonly DrawerDestination[] = [
  { key: "chats", label: "Chats", icon: "bubble" },
  { key: "projects", label: "Projects", icon: "folder" },
  { key: "artifacts", label: "Artifacts", icon: "layers" },
];

const ROUTE_BY_KEY: Readonly<Record<string, string>> = {
  chats: "/",
  projects: "/projects",
  artifacts: "/artifacts",
};

const ACCOUNT_NAME = "Advay";

export function DrawerShell(props: DrawerShellProps): ReactElement {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const routeName = props.state.routeNames[props.state.index] ?? "index";
  const activeKey = activeKeyForRoute(routeName);
  const recents = RECENT_SESSIONS.filter((session) =>
    session.title.toLowerCase().includes(search.trim().toLowerCase()),
  );

  function selectDestination(key: string): void {
    const route = ROUTE_BY_KEY[key] ?? "/";
    props.navigation.closeDrawer();
    router.navigate(route);
  }

  function selectSession(id: string): void {
    props.navigation.closeDrawer();
    router.push({ pathname: "/session/[id]", params: { id } });
  }

  function openSettings(): void {
    props.navigation.closeDrawer();
    router.push("/settings");
  }

  return (
    <DrawerContent
      destinations={DESTINATIONS}
      activeKey={activeKey}
      recents={recents}
      accountName={ACCOUNT_NAME}
      search={search}
      onSearchChange={setSearch}
      onSelectDestination={selectDestination}
      onSelectSession={selectSession}
      onOpenSettings={openSettings}
    />
  );
}

function activeKeyForRoute(routeName: string): string {
  if (routeName === "projects") {
    return "projects";
  }
  if (routeName === "artifacts") {
    return "artifacts";
  }
  return "chats";
}

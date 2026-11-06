import type { DrawerDestination } from "@projectx/ui";
import { DrawerContent } from "@projectx/ui";
import { useRouter } from "expo-router";
import type { ReactElement } from "react";
import { useEffect } from "react";

import { useSessionsStore } from "../state/sessionsStore";
import { useDrawerSearch } from "./useDrawerSearch";

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
  { key: "chats", label: "New Chat", icon: "bubble" },
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
  const search = useDrawerSearch(props.navigation);
  const sessions = useSessionsStore((state) => state.sessions);
  const refresh = useSessionsStore((state) => state.refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const routeName = props.state.routeNames[props.state.index] ?? "index";
  const activeKey = activeKeyForRoute(routeName);

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
      recents={sessions}
      accountName={ACCOUNT_NAME}
      search={search.query}
      searchGroups={search.groups}
      searching={search.searching}
      searchError={search.error}
      onSearchChange={search.setQuery}
      onSelectDestination={selectDestination}
      onSelectSession={selectSession}
      onSelectSearchResult={search.selectResult}
      onOpenSettings={openSettings}
    />
  );
}

function activeKeyForRoute(routeName: string): string {
  if (routeName === "projects" || routeName === "project/[id]") {
    return "projects";
  }
  if (routeName === "artifacts") {
    return "artifacts";
  }
  return "chats";
}

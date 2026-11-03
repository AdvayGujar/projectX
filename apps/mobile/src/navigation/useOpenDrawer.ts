import { useNavigation } from "expo-router";

interface DrawerControls {
  readonly openDrawer: () => void;
}

/**
 * Expo Router types `useNavigation` against the root param list, which carries no drawer
 * helpers. Every screen in this app is rendered inside the drawer layout from
 * `app/_layout.tsx`, so `openDrawer` is present at runtime; the cast is the narrowest way
 * to reach it without importing the vendored navigation router.
 */
export function useOpenDrawer(): () => void {
  const navigation = useNavigation();
  return () => {
    (navigation as unknown as DrawerControls).openDrawer();
  };
}

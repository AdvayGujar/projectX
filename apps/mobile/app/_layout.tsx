import { colors } from "@projectx/ui";
import { Drawer } from "expo-router/drawer";
import { StatusBar } from "expo-status-bar";
import type { ReactElement } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { DrawerShell } from "../src/navigation/DrawerShell";

export default function RootLayout(): ReactElement {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Drawer
          drawerContent={(props) => <DrawerShell {...props} />}
          screenOptions={{
            headerShown: false,
            drawerType: "front",
            overlayColor: colors.scrim,
            drawerStyle: { width: "88%", backgroundColor: colors.canvas },
            sceneStyle: { backgroundColor: colors.canvas },
          }}
        >
          <Drawer.Screen name="index" />
          <Drawer.Screen name="projects" />
          <Drawer.Screen name="artifacts" />
          <Drawer.Screen name="settings" />
          <Drawer.Screen name="session/[id]" />
          <Drawer.Screen name="dev/spike" />
        </Drawer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

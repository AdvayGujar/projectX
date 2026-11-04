import { SessionHeader } from "@projectx/ui";
import type { ReactElement } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface SessionTopBarProps {
  readonly modelLabel: string;
  readonly effort?: string;
  readonly onOpenDrawer: () => void;
  readonly onOpenModelPicker: () => void;
  readonly onOpenMenu: () => void;
}

/** Header zone of the session screen: safe area plus the three-affordance header. */
export function SessionTopBar({
  modelLabel,
  effort,
  onOpenDrawer,
  onOpenModelPicker,
  onOpenMenu,
}: SessionTopBarProps): ReactElement {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ paddingTop: insets.top }}>
      <SessionHeader
        model={modelLabel}
        effort={effort}
        onOpenDrawer={onOpenDrawer}
        onOpenModelPicker={onOpenModelPicker}
        onOpenMenu={onOpenMenu}
      />
    </View>
  );
}

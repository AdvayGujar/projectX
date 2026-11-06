import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, space, typography } from "../theme";

export type ProjectTabKey = "sessions" | "library" | "memory" | "artifacts";

const TABS: readonly { readonly key: ProjectTabKey; readonly label: string }[] = [
  { key: "sessions", label: "Sessions" },
  { key: "library", label: "Library" },
  { key: "memory", label: "Memory" },
  { key: "artifacts", label: "Artifacts" },
];

export interface ProjectTabsProps {
  readonly active: ProjectTabKey;
  readonly onSelect: (key: ProjectTabKey) => void;
}

/** The four project surfaces (C12). Controlled: the screen owns the active tab. */
export function ProjectTabs({ active, onSelect }: ProjectTabsProps): ReactElement {
  return (
    <View style={styles.root}>
      {TABS.map((tab) => {
        const selected = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected }}
            onPress={() => onSelect(tab.key)}
            style={styles.tab}
          >
            <Text style={[styles.label, selected ? styles.labelActive : undefined]}>
              {tab.label}
            </Text>
            <View style={[styles.rule, selected ? styles.ruleActive : undefined]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  tab: { flex: 1, alignItems: "center", paddingTop: space.sm, minHeight: 44 },
  label: { fontSize: typography.label, color: colors.textMuted, paddingBottom: space.sm },
  labelActive: { color: colors.text, fontWeight: "600" },
  rule: { height: 2, alignSelf: "stretch", backgroundColor: "transparent" },
  ruleActive: { backgroundColor: colors.text },
});

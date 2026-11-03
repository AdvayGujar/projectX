import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "../icons";
import { colors, HIT_SLOP, radius, space, typography } from "../theme";

export interface ProviderSummary {
  readonly id: string;
  readonly label: string;
  readonly presetLabel: string;
  readonly modelCount: number;
  readonly enabled: boolean;
}

export interface ProviderListProps {
  readonly providers: readonly ProviderSummary[];
  readonly onAdd: () => void;
  readonly onSelect: (id: string) => void;
}

/** Providers hold a key reference; the secret is in the keychain, never shown here. */
export function ProviderList({ providers, onAdd, onSelect }: ProviderListProps): ReactElement {
  return (
    <View style={styles.root}>
      {providers.length === 0 ? (
        <Text style={styles.empty}>
          No providers yet. Add one to pick a model and start a chat.
        </Text>
      ) : (
        providers.map((provider) => (
          <Pressable
            key={provider.id}
            accessibilityRole="button"
            onPress={() => onSelect(provider.id)}
            style={styles.row}
          >
            <View style={styles.rowText}>
              <Text style={styles.label}>{provider.label}</Text>
              <Text style={styles.meta}>{describe(provider)}</Text>
            </View>
            <Icon name="chevron" size={14} color={colors.textFaint} />
          </Pressable>
        ))
      )}

      <Pressable accessibilityRole="button" onPress={onAdd} hitSlop={HIT_SLOP} style={styles.add}>
        <Icon name="plus" size={16} color={colors.text} />
        <Text style={styles.addLabel}>Add provider</Text>
      </Pressable>
    </View>
  );
}

function describe(provider: ProviderSummary): string {
  return [provider.presetLabel, `${provider.modelCount} models`, provider.enabled ? null : "disabled"]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm },
  empty: {
    fontSize: typography.body,
    lineHeight: typography.bodyLineHeight,
    color: colors.textMuted,
    paddingVertical: space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  rowText: { flex: 1, gap: 2 },
  label: { fontSize: typography.body, color: colors.text },
  meta: { fontSize: typography.small, color: colors.textMuted },
  add: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.md,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.raised,
  },
  addLabel: { fontSize: typography.body, color: colors.text },
});

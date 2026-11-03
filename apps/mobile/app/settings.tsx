import type { ProviderRecord } from "@projectx/core";
import { AppError, PRESETS } from "@projectx/core";
import type { ProviderSummary } from "@projectx/ui";
import { AddProviderSheet, Icon, ProviderList, colors, HIT_SLOP, radius, space } from "@projectx/ui";
import { useFocusEffect } from "expo-router";
import type { ReactElement } from "react";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOpenDrawer } from "../src/navigation/useOpenDrawer";
import { addProvider, listModels, listProviders } from "../src/services/providerService";

export default function SettingsScreen(): ReactElement {
  const insets = useSafeAreaInsets();
  const openDrawer = useOpenDrawer();

  const [providers, setProviders] = useState<readonly ProviderSummary[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    const records = await listProviders();
    const summaries = await Promise.all(records.map(toSummary));
    setProviders(summaries);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  async function submit(input: { presetId: string; apiKey: string }): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await addProvider(input);
      await reload();
      setSheetOpen(false);
    } catch (failure) {
      setError(describe(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open navigation"
          hitSlop={HIT_SLOP}
          onPress={openDrawer}
          style={styles.iconButton}
        >
          <Icon name="menu" size={19} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Providers</Text>
        <View style={styles.iconButton} />
      </View>

      <ProviderList
        providers={providers}
        onAdd={() => {
          setError(null);
          setSheetOpen(true);
        }}
        onSelect={() => undefined}
      />

      <AddProviderSheet
        visible={sheetOpen}
        presets={PRESETS.map((preset) => ({
          id: preset.id,
          label: preset.label,
          keyHint: preset.keyHint,
        }))}
        busy={busy}
        error={error}
        onSubmit={(input) => {
          void submit(input);
        }}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

async function toSummary(provider: ProviderRecord): Promise<ProviderSummary> {
  const models = await listModels(provider.id);
  const preset = PRESETS.find((item) => item.id === provider.presetId);
  return {
    id: provider.id,
    label: provider.label,
    presetLabel: preset && preset.label !== provider.label ? preset.label : "",
    modelCount: models.length,
    enabled: provider.enabled,
  };
}

/** Provider errors are already user-facing; never surface a raw body or a key. */
function describe(failure: unknown): string {
  if (failure instanceof AppError) {
    return failure.userMessage;
  }
  if (failure instanceof Error) {
    return failure.message;
  }
  return "Could not add the provider.";
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, textAlign: "center", fontSize: 13, fontWeight: "600", color: colors.text },
});

import type { ProviderRecord } from "@projectx/core";
import { AppError, PRESETS } from "@projectx/core";
import type { ProviderSummary } from "@projectx/ui";
import {
  AddProviderSheet,
  ConfirmDialog,
  Icon,
  ProviderList,
  ProviderMenu,
  colors,
  HIT_SLOP,
  radius,
  space,
} from "@projectx/ui";
import { useFocusEffect } from "expo-router";
import type { ReactElement } from "react";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOpenDrawer } from "../src/navigation/useOpenDrawer";
import {
  addProvider,
  deleteProvider,
  listAvailableModels,
  listModels,
  listProviders,
} from "../src/services/providerService";
import { useModelStore } from "../src/state/modelStore";

export default function SettingsScreen(): ReactElement {
  const insets = useSafeAreaInsets();
  const openDrawer = useOpenDrawer();

  const [providers, setProviders] = useState<readonly ProviderSummary[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<ProviderSummary | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProviderSummary | null>(null);
  const setModels = useModelStore((state) => state.setModels);

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

  async function confirmDelete(): Promise<void> {
    if (!pendingDelete) {
      return;
    }
    try {
      await deleteProvider(pendingDelete.id);
      await reload();
      setModels(await listAvailableModels());
    } catch (failure) {
      setError(describe(failure));
    } finally {
      setPendingDelete(null);
    }
  }

  async function submit(input: { presetId: string; apiKey: string }): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await addProvider(input);
      await reload();
      setModels(await listAvailableModels());
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
        onSelect={(id) => setMenuFor(providers.find((provider) => provider.id === id) ?? null)}
      />

      <ProviderMenu
        visible={menuFor !== null}
        label={menuFor?.label ?? ""}
        detail={`${menuFor?.modelCount ?? 0} models · deleting removes the key from the keychain`}
        onDelete={() => {
          // Two modals cannot present at once on iOS; hand the menu over to the dialog.
          setPendingDelete(menuFor);
          setMenuFor(null);
        }}
        onClose={() => setMenuFor(null)}
      />

      <ConfirmDialog
        visible={pendingDelete !== null}
        title={`Delete ${pendingDelete?.label ?? "provider"}?`}
        message="The key is removed from the keychain and the cached model list is deleted. Chats that used this provider are kept."
        confirmLabel="Delete"
        onConfirm={() => {
          void confirmDelete();
        }}
        onCancel={() => setPendingDelete(null)}
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

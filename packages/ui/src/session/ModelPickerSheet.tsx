import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useKeyboardVisible } from "../primitives/useKeyboardVisible";

import { Icon } from "../icons";
import { effortLabel } from "./format";
import { colors, HIT_SLOP, radius, space, typography } from "../theme";
import type { ModelOption, ReasoningEffort } from "../types";

export interface ModelPickerSheetProps {
  readonly visible: boolean;
  readonly models: readonly ModelOption[];
  readonly selectedId: string | null;
  /** The effort currently chosen for the selected model; the model row defaults otherwise. */
  readonly selectedEffort?: string;
  readonly onSelect: (model: ModelOption, effort: string) => void;
  readonly onClose: () => void;
}

/**
 * Two steps: search and pick a model (grouped by provider), then choose reasoning effort
 * when the model supports it. Effort is part of the selection, not a global setting.
 */
export function ModelPickerSheet({
  visible,
  models,
  selectedId,
  selectedEffort,
  onSelect,
  onClose,
}: ModelPickerSheetProps): ReactElement {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<ModelOption | null>(null);

  const groups = useMemo(() => groupByProvider(models, query), [models, query]);

  function close(): void {
    setQuery("");
    setPending(null);
    onClose();
  }

  function choose(model: ModelOption): void {
    if (model.reasoning && model.reasoningEfforts.length > 0) {
      setPending(model);
      return;
    }
    onSelect(model, model.effort);
    close();
  }

  function chooseEffort(effort: ReasoningEffort): void {
    if (!pending) {
      return;
    }
    onSelect(pending, effort);
    close();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.scrim}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close model picker"
            style={StyleSheet.absoluteFill}
            onPress={close}
          />
        <View
          style={[
            styles.sheet,
            { paddingBottom: keyboardVisible ? space.lg : insets.bottom + space.xl },
          ]}
        >
          <View style={styles.head}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={pending ? "Back to models" : "Close"}
              hitSlop={HIT_SLOP}
              onPress={() => (pending ? setPending(null) : close())}
            >
              <View style={pending ? styles.backChevron : undefined}>
                <Icon name={pending ? "chevron" : "close"} size={16} color={colors.text} />
              </View>
            </Pressable>
            <Text style={styles.title}>{pending ? "Reasoning effort" : "Model"}</Text>
            <View style={styles.headSpacer} />
          </View>

          {pending ? (
            <EffortStep
              model={pending}
              selectedEffort={pending.id === selectedId ? selectedEffort : undefined}
              onChoose={chooseEffort}
            />
          ) : (
            <ModelStep
              groups={groups}
              query={query}
              onChangeQuery={setQuery}
              selectedId={selectedId}
              onChoose={choose}
              isEmpty={models.length === 0}
            />
          )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface ModelStepProps {
  readonly groups: readonly ModelGroup[];
  readonly query: string;
  readonly onChangeQuery: (value: string) => void;
  readonly selectedId: string | null;
  readonly onChoose: (model: ModelOption) => void;
  readonly isEmpty: boolean;
}

function ModelStep({
  groups,
  query,
  onChangeQuery,
  selectedId,
  onChoose,
  isEmpty,
}: ModelStepProps): ReactElement {
  return (
    <View style={styles.step}>
      <View style={styles.search}>
        <Icon name="search" size={14} color={colors.textMuted} />
        <TextInput
          accessibilityLabel="Search models"
          style={styles.searchInput}
          value={query}
          onChangeText={onChangeQuery}
          placeholder="Search models…"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {isEmpty ? (
          <Text style={styles.empty}>No models yet. Add a provider in Settings first.</Text>
        ) : null}

        {groups.map((group) => (
          <View key={group.provider}>
            <Text style={styles.groupLabel}>{group.provider}</Text>
            {group.models.map((model) => {
              const selected = model.id === selectedId;
              return (
                <Pressable
                  key={model.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityHint={model.vision ? "Supports images" : undefined}
                  onPress={() => onChoose(model)}
                  style={styles.row}
                >
                  <View style={styles.rowText}>
                    <View style={styles.labelRow}>
                      <Text style={styles.label}>{model.label}</Text>
                      {model.vision ? (
                        <View
                          accessible
                          accessibilityLabel="Supports images"
                          style={styles.visionTag}
                        >
                          <Icon name="image" size={12} color={colors.textMuted} />
                          <Text style={styles.visionText}>Images</Text>
                        </View>
                      ) : null}
                    </View>
                    {model.reasoning ? (
                      <Text style={styles.meta}>{reasoningMeta(model)}</Text>
                    ) : null}
                  </View>
                  {selected ? <Icon name="chevron" size={14} color={colors.text} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}

        {!isEmpty && groups.length === 0 ? (
          <Text style={styles.empty}>No model matches “{query}”.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function EffortStep({
  model,
  selectedEffort,
  onChoose,
}: {
  readonly model: ModelOption;
  readonly selectedEffort?: string;
  readonly onChoose: (effort: ReasoningEffort) => void;
}): ReactElement {
  const current = selectedEffort ?? model.effort;
  return (
    <View style={styles.step}>
      <Text style={styles.effortModel}>{model.label}</Text>
      <ScrollView style={styles.list}>
        {model.reasoningEfforts.map((effort) => (
          <Pressable
            key={effort}
            accessibilityRole="button"
            onPress={() => onChoose(effort)}
            style={styles.row}
          >
            <Text style={styles.label}>{effortLabel(effort)}</Text>
            {current === effort ? <Icon name="chevron" size={14} color={colors.text} /> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function reasoningMeta(model: ModelOption): string {
  if (model.reasoningEfforts.length > 0) {
    return "Reasoning · choose effort";
  }
  return model.canDisableReasoning ? "Reasoning" : "Reasoning · always on";
}

interface ModelGroup {
  readonly provider: string;
  readonly models: readonly ModelOption[];
}

function groupByProvider(models: readonly ModelOption[], query: string): ModelGroup[] {
  const needle = query.trim().toLowerCase();
  const filtered = models.filter(
    (model) =>
      needle.length === 0 ||
      model.label.toLowerCase().includes(needle) ||
      model.provider.toLowerCase().includes(needle),
  );

  const groups = new Map<string, ModelOption[]>();
  for (const model of filtered) {
    const bucket = groups.get(model.provider);
    if (bucket) {
      bucket.push(model);
    } else {
      groups.set(model.provider, [model]);
    }
  }

  return [...groups.entries()].map(([provider, items]) => ({ provider, models: items }));
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" },
  sheet: {
    height: "78%",
    backgroundColor: colors.raised,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: space.md,
    paddingHorizontal: space.lg,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.sm,
  },
  title: { fontSize: 13, fontWeight: "600", color: colors.text },
  headSpacer: { width: 16 },
  step: { flex: 1, minHeight: 0 },
  backChevron: { transform: [{ rotate: "180deg" }] },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: colors.composer,
    marginBottom: space.sm,
  },
  searchInput: { flex: 1, fontSize: typography.label, color: colors.text, padding: 0 },
  list: { flex: 1 },
  groupLabel: {
    marginTop: space.md,
    marginBottom: space.xs,
    fontSize: typography.caption,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.textFaint,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  rowText: { flex: 1, gap: 2 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  label: { fontSize: typography.body, color: colors.text },
  visionTag: { flexDirection: "row", alignItems: "center", gap: 4 },
  visionText: { fontSize: typography.small, color: colors.textMuted },
  meta: { fontSize: typography.small, color: colors.textMuted },
  empty: {
    paddingVertical: space.lg,
    fontSize: typography.label,
    color: colors.textMuted,
    lineHeight: 18,
  },
  effortModel: {
    fontSize: typography.small,
    color: colors.textMuted,
    marginBottom: space.sm,
  },
});

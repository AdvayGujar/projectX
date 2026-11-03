import { FlashList } from "@shopify/flash-list";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Row = { id: string; text: string };

const ROW_COUNT = 5000;

export function ListSpike({ onClose }: { onClose: () => void }) {
  const [started] = useState(() => Date.now());
  const rows = useMemo<Row[]>(
    () => Array.from({ length: ROW_COUNT }, (_, index) => ({
      id: String(index),
      text: `Message ${index} — the quick brown fox jumps over the lazy dog.`,
    })),
    [],
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.back}>Back</Text>
        </Pressable>
        <Text style={styles.title}>{ROW_COUNT.toLocaleString()} rows · {Date.now() - started} ms</Text>
      </View>
      <FlashList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <Text style={styles.row}>{item.text}</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F7F5F0" },
  header: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  back: { fontSize: 15, color: "#6B6459" },
  title: { fontSize: 15, fontWeight: "600", color: "#1F1D1A" },
  row: { paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: "#2E2A25" },
});

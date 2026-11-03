import { StatusBar } from "expo-status-bar";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { generateDocx, generatePdf, generatePptx, generateXlsx } from "./src/spike/files";
import { ListSpike } from "./src/spike/ListSpike";
import { parseAction, type SpikeAction } from "./src/spike/links";
import { extractFixturePdf, extractPickedPdf } from "./src/spike/pdf";
import { runDbCheck } from "./src/spike/db";
import { runSqlitePerf } from "./src/spike/sqlite";
import { testStreaming, type Provider } from "./src/spike/streaming";
import type { SpikeResult } from "./src/spike/types";

type Action = () => Promise<SpikeResult | void>;

const ACTION_RUNNERS: Record<Exclude<SpikeAction, "list">, { label: string; run: Action }> = {
  pptx: { label: "PPTX", run: generatePptx },
  xlsx: { label: "XLSX", run: generateXlsx },
  docx: { label: "DOCX", run: generateDocx },
  pdf: { label: "PDF", run: generatePdf },
  db: { label: "DB", run: runDbCheck },
  "pdf-fixture": { label: "PDF fixture", run: extractFixturePdf },
};

export default function App() {
  const [busy, setBusy] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>(["M0 spike harness"]);
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<Provider>("deepseek");
  const [showList, setShowList] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);

  function append(line: string) {
    setLines((current) => [...current, line]);
  }

  async function run(label: string, action: Action) {
    setBusy(label);
    append(`${label}: running`);
    try {
      const result = await action();
      append(result ? `PASS ${result.label} · ${result.ms} ms · ${result.detail}` : `PASS ${label}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      append(`FAIL ${label} · ${message}`);
    } finally {
      setBusy(null);
    }
  }

  async function runAction(action: SpikeAction) {
    if (action === "list") {
      append("List 5k: open");
      setShowList(true);
      return;
    }
    const entry = ACTION_RUNNERS[action];
    await run(entry.label, entry.run);
  }

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, [lines]);

  useEffect(() => {
    void runActionFile();
  }, []);

  async function runActionFile() {
    const directory = FileSystem.documentDirectory;
    if (!directory) {
      return;
    }
    const uri = `${directory}spike-action.txt`;
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        return;
      }
      const value = await FileSystem.readAsStringAsync(uri);
      await FileSystem.deleteAsync(uri, { idempotent: true });
      const action = parseAction(value);
      if (action) {
        await runAction(action);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      append(`Action file: ${message}`);
    }
  }

  const disabled = busy !== null;

  if (showList) {
    return (
      <ListSpike
        onClose={() => {
          setShowList(false);
          append("List 5k: closed");
        }}
      />
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <Text style={styles.title}>M0 checks</Text>
        <Text style={styles.subtitle}>
          Generate files, read a PDF, measure SQLite, stream a provider.
        </Text>

        <View style={styles.grid}>
          <SpikeButton label="PPTX" disabled={disabled} onPress={() => run("PPTX", generatePptx)} />
          <SpikeButton label="XLSX" disabled={disabled} onPress={() => run("XLSX", generateXlsx)} />
          <SpikeButton label="DOCX" disabled={disabled} onPress={() => run("DOCX", generateDocx)} />
          <SpikeButton label="PDF" disabled={disabled} onPress={() => run("PDF", generatePdf)} />
          <SpikeButton label="Read PDF" disabled={disabled} onPress={() => run("Read PDF", extractPickedPdf)} />
          <SpikeButton label="SQLite" disabled={disabled} onPress={() => run("SQLite", runSqlitePerf)} />
          <SpikeButton label="DB" disabled={disabled} onPress={() => run("DB", runDbCheck)} />
          <SpikeButton
            label="List 5k"
            disabled={disabled}
            onPress={() => {
              append("List 5k: open");
              setShowList(true);
            }}
          />
        </View>

        <View style={styles.providerRow}>
          <SpikeButton
            label="DeepSeek"
            disabled={disabled}
            selected={provider === "deepseek"}
            onPress={() => setProvider("deepseek")}
          />
          <SpikeButton
            label="OpenCode Go"
            disabled={disabled}
            selected={provider === "opencode-go"}
            onPress={() => setProvider("opencode-go")}
          />
          <SpikeButton
            label="Mock"
            disabled={disabled}
            selected={provider === "mock"}
            onPress={() => setProvider("mock")}
          />
        </View>

        <TextInput
          style={styles.input}
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="Provider API key (memory only)"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <SpikeButton
          label={`Stream ${provider}`}
          disabled={disabled || (provider !== "mock" && apiKey.trim().length === 0)}
          onPress={() => run("Stream", () => testStreaming(provider, apiKey.trim()))}
        />

        <View style={styles.logHeader}>
          <Text style={styles.logTitle}>Log</Text>
          <Pressable onPress={() => setLines([])} disabled={disabled}>
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        </View>
        {lines.map((line, index) => (
          <Text key={`${index}-${line}`} style={styles.logLine}>{line}</Text>
        ))}
        {busy ? <ActivityIndicator style={styles.spinner} /> : null}
      </ScrollView>
    </View>
  );
}

function SpikeButton({
  label,
  disabled,
  onPress,
  selected = false,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      style={[styles.button, selected && styles.buttonSelected, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.buttonText, selected && styles.buttonTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F7F5F0" },
  content: { paddingTop: 72, paddingHorizontal: 20, paddingBottom: 48, gap: 12 },
  title: { fontSize: 32, fontWeight: "700", color: "#1F1D1A" },
  subtitle: { fontSize: 14, color: "#6B6459", marginBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  providerRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#C9C2B6",
    backgroundColor: "#FFFFFF",
  },
  buttonSelected: { backgroundColor: "#1F1D1A", borderColor: "#1F1D1A" },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontSize: 14, fontWeight: "600", color: "#1F1D1A" },
  buttonTextSelected: { color: "#F7F5F0" },
  input: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#C9C2B6",
    backgroundColor: "#FFFFFF",
    fontSize: 14,
    color: "#1F1D1A",
  },
  logHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16 },
  logTitle: { fontSize: 16, fontWeight: "700", color: "#1F1D1A" },
  clear: { fontSize: 13, color: "#6B6459" },
  logLine: {
    fontSize: 12,
    lineHeight: 18,
    color: "#2E2A25",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
  spinner: { marginTop: 12 },
});

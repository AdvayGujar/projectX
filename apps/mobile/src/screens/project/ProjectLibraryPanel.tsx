import type { FileKind, FileRecord, ProjectLink } from "@projectx/core";
import { Icon, colors, HIT_SLOP, radius, space, typography } from "@projectx/ui";
import { FlashList } from "@shopify/flash-list";
import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ProjectLibraryItem } from "../../services/projectLibraryService";

const EMPTY_TEXT = "No files or links yet. Add one to keep it with this project.";
const HOST = /^https?:\/\/(?:[^@/?#]+@)?([^/?#]+)/i;
const KILOBYTE = 1024;
const MEGABYTE = 1024 * 1024;
const KIND_LABELS: Readonly<Record<FileKind, string>> = {
  pdf: "PDF",
  docx: "DOCX",
  xlsx: "XLSX",
  pptx: "PPTX",
  image: "Image",
  text: "Text",
  other: "File",
};

export interface ProjectLibraryPanelProps {
  readonly items: readonly ProjectLibraryItem[];
  readonly busy: boolean;
  readonly onAddFile: () => void;
  readonly onAddLink: () => void;
  readonly onOpenFile: (file: FileRecord) => void;
  readonly onOpenLink: (link: ProjectLink) => void;
  readonly onRemoveFile: (file: FileRecord) => void;
  readonly onRemoveLink: (link: ProjectLink) => void;
}

/** Files and saved links share one list; a link's summary snapshot is not a second row. */
export function ProjectLibraryPanel({
  items,
  busy,
  onAddFile,
  onAddLink,
  onOpenFile,
  onOpenLink,
  onRemoveFile,
  onRemoveLink,
}: ProjectLibraryPanelProps): ReactElement {
  return (
    <View style={styles.root}>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add file"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          hitSlop={HIT_SLOP}
          onPress={onAddFile}
          style={[styles.addButton, busy ? styles.addButtonDisabled : undefined]}
        >
          <Icon name="attach" size={16} color={colors.text} />
          <Text style={styles.addLabel}>{busy ? "Reading file…" : "Add file"}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add link"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          hitSlop={HIT_SLOP}
          onPress={onAddLink}
          style={[styles.addButton, busy ? styles.addButtonDisabled : undefined]}
        >
          <Icon name="search" size={16} color={colors.text} />
          <Text style={styles.addLabel}>Add link</Text>
        </Pressable>
      </View>

      {items.length === 0 ? (
        <Text style={styles.empty}>{EMPTY_TEXT}</Text>
      ) : (
        <FlashList
          data={items}
          keyExtractor={itemKey}
          renderItem={({ item }) =>
            item.kind === "file" ? (
              <FileRow file={item.file} onOpen={onOpenFile} onRemove={onRemoveFile} />
            ) : (
              <LinkRow link={item.link} onOpen={onOpenLink} onRemove={onRemoveLink} />
            )
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

function FileRow({
  file,
  onOpen,
  onRemove,
}: {
  readonly file: FileRecord;
  readonly onOpen: (file: FileRecord) => void;
  readonly onRemove: (file: FileRecord) => void;
}): ReactElement {
  const meta = `${KIND_LABELS[file.kind]} · ${formatSize(file.size)}`;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${file.name}`}
        onPress={() => onOpen(file)}
        style={styles.rowMain}
      >
        <View style={styles.icon}>
          <Icon name={iconForFile(file.kind)} size={17} color={colors.textMuted} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.title} numberOfLines={1}>
            {file.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </Pressable>
      <RemoveButton label={`Remove ${file.name}`} onPress={() => onRemove(file)} />
    </View>
  );
}

function LinkRow({
  link,
  onOpen,
  onRemove,
}: {
  readonly link: ProjectLink;
  readonly onOpen: (link: ProjectLink) => void;
  readonly onRemove: (link: ProjectLink) => void;
}): ReactElement {
  const status = statusText(link);
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${link.title}`}
        onPress={() => onOpen(link)}
        style={styles.rowMain}
      >
        <View style={styles.icon}>
          <Icon name="search" size={17} color={colors.textMuted} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.title} numberOfLines={1}>
            {link.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {hostOf(link.url)}
          </Text>
          <Text
            style={[styles.status, link.status === "error" ? styles.statusError : undefined]}
            numberOfLines={2}
          >
            {status}
          </Text>
        </View>
      </Pressable>
      <RemoveButton label={`Remove ${link.title}`} onPress={() => onRemove(link)} />
    </View>
  );
}

function RemoveButton({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={styles.remove}
    >
      <Icon name="trash" size={16} color={colors.textFaint} />
    </Pressable>
  );
}

function itemKey(item: ProjectLibraryItem): string {
  return item.kind === "file" ? `file-${item.file.id}` : `link-${item.link.id}`;
}

function iconForFile(kind: FileKind): "image" | "slides" | "attach" {
  if (kind === "image") {
    return "image";
  }
  return kind === "pptx" ? "slides" : "attach";
}

function statusText(link: ProjectLink): string {
  if (link.status === "error") {
    return link.error ?? "Could not read that link.";
  }
  if (link.status === "ready") {
    return "Ready";
  }
  return "Reading link…";
}

function hostOf(url: string): string {
  const host = HOST.exec(url)?.[1] ?? url;
  return host.replace(/:\d+$/u, "").replace(/^www\./iu, "");
}

function formatSize(bytes: number): string {
  if (bytes < KILOBYTE) {
    return `${bytes} B`;
  }
  if (bytes < MEGABYTE) {
    return `${Math.round(bytes / KILOBYTE)} KB`;
  }
  return `${(bytes / MEGABYTE).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  actions: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.raised,
  },
  addLabel: { fontSize: typography.body, color: colors.text },
  addButtonDisabled: { opacity: 0.5 },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  empty: {
    fontSize: typography.body,
    lineHeight: typography.bodyLineHeight,
    color: colors.textMuted,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 44,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 44,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.card,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.raised,
  },
  rowText: { flex: 1, gap: 2 },
  title: { fontSize: typography.body, color: colors.text },
  meta: { fontSize: typography.small, color: colors.textMuted },
  status: { fontSize: typography.small, color: colors.textMuted },
  statusError: { color: colors.danger },
  remove: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});

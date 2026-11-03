import type { ReactElement } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../icons";
import { colors, HIT_SLOP, radius, space, typography } from "../theme";
import type { DrawerDestination, RecentSession } from "../types";

export interface DrawerContentProps {
  readonly destinations: readonly DrawerDestination[];
  readonly activeKey: string;
  readonly recents: readonly RecentSession[];
  readonly accountName: string;
  readonly search: string;
  readonly onSearchChange: (value: string) => void;
  readonly onSelectDestination: (key: string) => void;
  readonly onSelectSession: (id: string) => void;
  readonly onOpenSettings: () => void;
}

/** Drawer contents per UI_SPEC.md §6. Settings lives behind the account row. */
export function DrawerContent({
  destinations,
  activeKey,
  recents,
  accountName,
  search,
  onSearchChange,
  onSelectDestination,
  onSelectSession,
  onOpenSettings,
}: DrawerContentProps): ReactElement {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom }]}>
      <Text style={styles.title}>ProjectX</Text>

      <View style={styles.search}>
        <Icon name="search" size={15} color={colors.textMuted} />
        <TextInput
          accessibilityLabel="Search chats"
          style={styles.searchInput}
          value={search}
          onChangeText={onSearchChange}
          placeholder="Search chats…"
          placeholderTextColor={colors.textFaint}
          returnKeyType="search"
        />
      </View>

      <View style={styles.nav}>
        {destinations.map((destination) => {
          const active = destination.key === activeKey;
          return (
            <Pressable
              key={destination.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onSelectDestination(destination.key)}
              style={[styles.navItem, active ? styles.navItemActive : undefined]}
            >
              <Icon
                name={destination.icon}
                size={17}
                color={active ? colors.text : colors.textMuted}
              />
              <Text style={[styles.navLabel, active ? styles.navLabelActive : undefined]}>
                {destination.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Recents</Text>

      <ScrollView style={styles.recents} contentContainerStyle={styles.recentsContent}>
        {recents.map((session) => (
          <Pressable
            key={session.id}
            accessibilityRole="button"
            onPress={() => onSelectSession(session.id)}
            style={styles.recentRow}
          >
            <Text style={styles.recentTitle} numberOfLines={1}>
              {session.title}
            </Text>
          </Pressable>
        ))}
        {recents.length === 0 ? <Text style={styles.emptyRecents}>No chats yet</Text> : null}
      </ScrollView>

      <View style={styles.account}>
        <View style={styles.avatar}>
          <Text style={styles.avatarLetter}>{accountName.slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={styles.accountName}>{accountName}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={HIT_SLOP}
          onPress={onOpenSettings}
        >
          <Icon name="more" size={17} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  title: {
    fontSize: 26,
    fontWeight: "600",
    color: colors.text,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: 14,
    marginBottom: space.md,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: colors.composer,
  },
  searchInput: { flex: 1, fontSize: typography.label, color: colors.text, padding: 0 },
  nav: { paddingHorizontal: 10, paddingBottom: space.sm },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: 10,
    paddingHorizontal: space.sm,
    borderRadius: space.sm,
  },
  navItemActive: { backgroundColor: "rgba(255,255,255,0.06)" },
  navLabel: { fontSize: typography.body, color: colors.textMuted },
  navLabelActive: { color: colors.text },
  sectionLabel: {
    paddingTop: 6,
    paddingBottom: 4,
    paddingHorizontal: space.xl,
    fontSize: typography.caption,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.textFaint,
  },
  recents: { flex: 1 },
  recentsContent: { paddingHorizontal: 10, paddingBottom: space.sm },
  recentRow: { paddingVertical: 9, paddingHorizontal: space.sm },
  recentTitle: { fontSize: typography.body, color: colors.text, opacity: 0.85 },
  emptyRecents: {
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    fontSize: typography.label,
    color: colors.textFaint,
  },
  account: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: "#b45309",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { fontSize: typography.small, fontWeight: "700", color: "#ffffff" },
  accountName: { flex: 1, fontSize: 13, color: colors.text },
});

import type { DrawerSearchGroup, DrawerSearchItem } from "@projectx/ui";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking } from "react-native";

import { describeError } from "../services/errorMessage";
import { openFileById } from "../services/filePreview";
import { searchWorkspace } from "../services/searchService";

const SEARCH_DEBOUNCE_MS = 250;
const MIN_SEARCH_LENGTH = 2;
const SEARCH_FALLBACK_ERROR = "Could not search this workspace.";
const OPEN_FALLBACK_ERROR = "Could not open that result.";

export interface DrawerSearch {
  readonly query: string;
  readonly groups: readonly DrawerSearchGroup[];
  readonly searching: boolean;
  readonly error: string | null;
  readonly setQuery: (value: string) => void;
  readonly selectResult: (item: DrawerSearchItem) => void;
}

interface DrawerNavigation {
  readonly closeDrawer: () => void;
}

interface SearchResults {
  readonly groups: readonly DrawerSearchGroup[];
  readonly searching: boolean;
  readonly error: string | null;
  readonly setError: (value: string | null) => void;
}

/** Debounced workspace search for the drawer, with result navigation attached. */
export function useDrawerSearch(navigation: DrawerNavigation): DrawerSearch {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { groups, searching, error, setError } = useSearchResults(query);

  function focusMessage(item: DrawerSearchItem): void {
    if (!item.sessionId || !item.messageId) {
      setError(OPEN_FALLBACK_ERROR);
      return;
    }
    navigation.closeDrawer();
    router.push({
      pathname: "/session/[id]",
      params: { id: item.sessionId, focus: item.messageId },
    });
  }

  async function openChunkResult(item: DrawerSearchItem): Promise<void> {
    try {
      if (item.sourceUrl) {
        await Linking.openURL(item.sourceUrl);
      } else if (item.fileId) {
        await openFileById(item.fileId);
      } else {
        setError(OPEN_FALLBACK_ERROR);
        return;
      }
      setError(null);
      navigation.closeDrawer();
    } catch (failure) {
      setError(describeError(failure, OPEN_FALLBACK_ERROR));
    }
  }

  function selectResult(item: DrawerSearchItem): void {
    if (item.kind === "message") {
      focusMessage(item);
      return;
    }
    void openChunkResult(item);
  }

  return { query, groups, searching, error, setQuery, selectResult };
}

function useSearchResults(query: string): SearchResults {
  const [groups, setGroups] = useState<readonly DrawerSearchGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const value = query.trim();
    requestId.current += 1;
    if (value.length < MIN_SEARCH_LENGTH) {
      setGroups([]);
      setSearching(false);
      setError(null);
      return;
    }

    const currentRequest = requestId.current;
    setSearching(true);
    setError(null);
    const timer = setTimeout(() => {
      // Deliberately fire-and-forget; the request id drops a stale response.
      void searchWorkspace(value)
        .then((results) => {
          if (currentRequest !== requestId.current) {
            return;
          }
          setGroups(results);
          setSearching(false);
        })
        .catch((failure: unknown) => {
          if (currentRequest !== requestId.current) {
            return;
          }
          setError(describeError(failure, SEARCH_FALLBACK_ERROR));
          setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      // Also invalidates a response that is already in flight when the query changes.
      requestId.current += 1;
    };
  }, [query]);

  return { groups, searching, error, setError };
}

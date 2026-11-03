import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

import { listAvailableModels } from "../services/providerService";
import { useModelStore } from "./modelStore";

/**
 * Reloads the model list whenever the screen gains focus, so adding or deleting a provider
 * in Settings is reflected without restarting the app. On a delete the store also drops a
 * selection that no longer exists (see `setModels`).
 */
export function useModelCatalog(): void {
  const setModels = useModelStore((state) => state.setModels);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void listAvailableModels().then((models) => {
        if (active) {
          setModels(models);
        }
      });
      return () => {
        active = false;
      };
    }, [setModels]),
  );
}

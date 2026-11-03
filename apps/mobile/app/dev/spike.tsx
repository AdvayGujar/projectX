import { useRouter } from "expo-router";
import type { ReactElement } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SpikeHarness } from "../../src/spike/SpikeHarness";

export default function SpikeRoute(): ReactElement {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Pressable onPress={() => router.back()}>
          <Text>← Back</Text>
        </Pressable>
        <SpikeHarness />
      </View>
    </SafeAreaView>
  );
}
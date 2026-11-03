import { useEffect, useState } from "react";
import { Keyboard } from "react-native";

/**
 * True while the software keyboard is open. Used to drop bottom safe-area padding, which is
 * already covered by the keyboard and shows up as a dead gap above it.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}

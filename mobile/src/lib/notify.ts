import { Alert, Platform } from "react-native";

/** Cross-platform one-button message (Alert.alert is a no-op on react-native-web). */
export function notify(title: string, message?: string) {
  if (Platform.OS === "web") globalThis.alert?.(message ? `${title}\n${message}` : title);
  else Alert.alert(title, message);
}

/** Cross-platform confirm; resolves true when the user accepts. */
export function confirm(title: string, message: string, okLabel = "OK"): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(globalThis.confirm?.(`${title}\n${message}`) ?? true);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: okLabel, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}

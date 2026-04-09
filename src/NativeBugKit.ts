import { NativeModules, NativeEventEmitter, Platform } from "react-native";

const { RNBugKit } = NativeModules;

if (!RNBugKit) {
  console.warn(
    "[RNBugKit] Native module not found. " +
      "Make sure you ran `pod install` on iOS or rebuilt the Android project.",
  );
}

export const NativeBugKit = {
  setShakeEnabled(enabled: boolean): void {
    RNBugKit?.setShakeEnabled(enabled);
  },

  async captureScreen(): Promise<string | undefined> {
    if (!RNBugKit) return undefined;
    try {
      return await RNBugKit.captureScreen();
    } catch {
      return undefined;
    }
  },

  addShakeListener(callback: () => void): () => void {
    if (!RNBugKit) return () => {};

    const emitter = new NativeEventEmitter(RNBugKit);
    const subscription = emitter.addListener("RNBugKitShake", callback);

    return () => subscription.remove();
  },
};

export default NativeBugKit;

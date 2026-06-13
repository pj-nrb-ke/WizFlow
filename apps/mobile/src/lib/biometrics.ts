import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const BIOMETRIC_KEY = "wf_biometric_enabled";

export async function isBiometricEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(BIOMETRIC_KEY)) === "1";
}

export async function setBiometricEnabled(on: boolean): Promise<void> {
  if (on) await SecureStore.setItemAsync(BIOMETRIC_KEY, "1");
  else await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
}

export async function canUseBiometric(): Promise<boolean> {
  const hw = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return hw && enrolled;
}

export async function requireBiometric(): Promise<boolean> {
  const enabled = await isBiometricEnabled();
  if (!enabled) return true;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock WizFlow",
    fallbackLabel: "Use passcode",
  });
  return result.success;
}

/** Biometric confirmation for a sensitive action (approve/reject). If the device
 *  has no biometric hardware/enrollment, returns true (nothing to verify). */
export async function confirmBiometricForAction(reason: string): Promise<boolean> {
  const available = await canUseBiometric();
  if (!available) return true;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    fallbackLabel: "Use passcode",
  });
  return result.success;
}

import { Alert } from "react-native";

export type DocType = "auto" | "receipt" | "invoice" | "cheque";

export function pickDocumentType(): Promise<DocType> {
  return new Promise((resolve) => {
    Alert.alert("Document type", "Choose a type for better OCR accuracy.", [
      { text: "Auto", onPress: () => resolve("auto") },
      { text: "Receipt", onPress: () => resolve("receipt") },
      { text: "Invoice", onPress: () => resolve("invoice") },
      { text: "Cheque", onPress: () => resolve("cheque") },
      { text: "Cancel", style: "cancel", onPress: () => resolve("auto") },
    ]);
  });
}

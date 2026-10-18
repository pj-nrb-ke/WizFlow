import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { colors } from "../src/theme/colors";

// The Learning Resources site is served from the web origin (Caddy on the VPS).
// Videos stream from there — nothing is bundled into the app.
const WEB_BASE = (process.env.EXPO_PUBLIC_WEB_URL || "https://app.wizflow.biz").replace(/\/$/, "");
const LEARN_URL = `${WEB_BASE}/learn/index.html`;

export default function LearningScreen() {
  const [loading, setLoading] = useState(true);
  return (
    <View style={styles.root}>
      <WebView
        source={{ uri: LEARN_URL }}
        style={styles.web}
        startInLoadingState
        onLoadEnd={() => setLoading(false)}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction
        // Keep navigation inside /learn within the WebView.
        originWhitelist={["*"]}
      />
      {loading ? (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  web: { flex: 1, backgroundColor: colors.bg },
  loader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});

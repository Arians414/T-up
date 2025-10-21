import React, { useCallback, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Button } from "@/components/ui";
import { useAppState } from "@/state/appState";
import { useIntakeState } from "@/state/intakeState";
import { supabase } from "@/lib/supabase";
import { post } from "@/lib/functionsClient";
import { getOrCreateInstallId } from "@/lib/installId";
import { useTheme } from "@/theme";

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { resetAppState, smoking, setSmoking } = useAppState();
  const { reset: resetIntakeState } = useIntakeState();
  const [smokeModal, setSmokeModal] = useState(false);
  const [draftNone, setDraftNone] = useState(false);
  const [draft, setDraft] = useState(smoking);

  const handleDevEnsureProfile = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        Alert.alert("Dev action", "No session token found.");
        return;
      }
      const response = await post("/ensure_profile", {}, accessToken);
      Alert.alert("ensure_profile", JSON.stringify(response));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert("ensure_profile error", message);
    }
  }, []);

  const handleDevLinkAnonymous = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        Alert.alert("Dev action", "No session token found.");
        return;
      }
      const installId = await getOrCreateInstallId();
      const response = await post("/link_anonymous_p1_to_user", { install_id: installId }, accessToken);
      Alert.alert("link_anonymous_p1_to_user", JSON.stringify(response));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert("link_anonymous error", message);
    }
  }, []);

  const handleDevSaveAnonymous = useCallback(async () => {
    try {
      const installId = await getOrCreateInstallId();
      const response = await post("/save_anonymous_p1", {
        install_id: installId,
        payload: { hello: "dev", at: new Date().toISOString() },
        schema_version: "v1",
      });
      Alert.alert("save_anonymous_p1", JSON.stringify(response));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert("save_anonymous error", message);
    }
  }, []);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.background,
          paddingHorizontal: theme.space["20"],
          paddingTop: theme.space["40"],
        },
      ]}
    >
      <Text
        style={[
          styles.heading,
          {
            color: theme.colors.text.primary,
            fontFamily: "Inter_600SemiBold",
            fontSize: theme.typography.scale.xl,
          },
        ]}
      >
        Profile
      </Text>
      <Text
        style={[
          styles.body,
          {
            color: theme.colors.text.secondary,
            fontFamily: "Inter_400Regular",
            marginTop: theme.space["12"],
          },
        ]}
      >
        Account and metric preferences land with the auth work (Step 8). This stub keeps routing wired until then.
      </Text>

      {/* Smoking settings row */}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setDraft(smoking);
          const none = !smoking.cigarettes && !smoking.vape && !smoking.weed;
          setDraftNone(none);
          setSmokeModal(true);
        }}
        style={{ marginTop: theme.space["20"] }}
      >
        <View style={{ gap: theme.space["6"] }}>
          <Text style={{ color: theme.colors.text.primary, fontFamily: "Inter_600SemiBold", fontSize: theme.typography.scale.lg }}>
            Do you smoke?
          </Text>
          <Text style={{ color: theme.colors.text.secondary, fontFamily: "Inter_400Regular" }}>
            {!smoking.cigarettes && !smoking.vape && !smoking.weed
              ? "None"
              : [smoking.cigarettes && "Cigarettes", smoking.vape && "Vape", smoking.weed && "Weed"].filter(Boolean).join(", ")}
          </Text>
        </View>
      </Pressable>

      <Modal visible={smokeModal} transparent animationType="fade" onRequestClose={() => setSmokeModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setSmokeModal(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: theme.colors.text.primary }]}>Do you smoke?</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const next = !draftNone;
                setDraftNone(next);
                if (next) setDraft({ cigarettes: false, vape: false, weed: false });
              }}
              style={styles.row}
            >
              <Text
                style={[
                  styles.check,
                  { borderColor: theme.colors.border.subtle, backgroundColor: draftNone ? theme.colors.accent.brand : "transparent" },
                ]}
              />
              <Text style={[styles.rowLabel, { color: theme.colors.text.primary }]}>I don't smoke (hide smoking tracking)</Text>
            </Pressable>

            <Text style={[styles.subhead, { color: theme.colors.text.secondary }]}>If you do, what do you use?</Text>

            {(["cigarettes", "vape", "weed"] as const).map((key) => {
              const enabled = !draftNone;
              const checked = draft[key];
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  onPress={() => enabled && setDraft((prev) => ({ ...prev, [key]: !prev[key] }))}
                  style={[styles.row, !enabled && { opacity: 0.5 }]}
                >
                  <Text
                    style={[
                      styles.check,
                      { borderColor: theme.colors.border.subtle, backgroundColor: enabled && checked ? theme.colors.accent.brand : "transparent" },
                    ]}
                  />
                  <Text style={[styles.rowLabel, { color: theme.colors.text.primary }]}>{key === "cigarettes" ? "Cigarettes" : key === "vape" ? "Vaping" : "Weed"}</Text>
                </Pressable>
              );
            })}

            <Text style={[styles.note, { color: theme.colors.text.tertiary }]}>This helps tailor logging and insights. You can change this anytime.</Text>

            <View style={{ flexDirection: "row", gap: theme.space["12"], marginTop: theme.space["12"] }}>
              <Pressable accessibilityRole="button" onPress={() => { setDraftNone(true); setDraft({ cigarettes: false, vape: false, weed: false }); }} style={styles.quick}>
                <Text style={{ color: theme.colors.text.primary, fontFamily: "Inter_500Medium" }}>Set: None</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => { setDraftNone(false); setDraft({ cigarettes: true, vape: true, weed: true }); }} style={styles.quick}>
                <Text style={{ color: theme.colors.text.primary, fontFamily: "Inter_500Medium" }}>Set: All</Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", gap: theme.space["12"], marginTop: theme.space["16"] }}>
              <Pressable accessibilityRole="button" onPress={() => setSmokeModal(false)} style={[styles.action, { borderColor: theme.colors.border.subtle }]}>
                <Text style={{ color: theme.colors.text.primary, fontFamily: "Inter_600SemiBold" }}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={async () => {
                  const final = draftNone ? { cigarettes: false, vape: false, weed: false } : draft;
                  await setSmoking(final);
                  setSmokeModal(false);
                }}
                style={[styles.action, { backgroundColor: theme.colors.accent.brand }]}
              >
                <Text style={{ color: theme.colors.text.inverse, fontFamily: "Inter_600SemiBold" }}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={{ marginTop: "auto", gap: theme.space["12"] }}>
        <Button
          label="Reset app (dev)"
          variant="secondary"
          onPress={async () => {
            resetIntakeState();
            await resetAppState();
            router.replace("/onboarding");
          }}
        />
        {__DEV__ && (
          <Button
            label="Dev: Open weekly now"
            variant="secondary"
            onPress={async () => {
              try {
                const { data } = await supabase.auth.getSession();
                const accessToken = data.session?.access_token;
                if (!accessToken) {
                  Alert.alert("Dev action", "No session token found.");
                  return;
                }
                await post("/dev_open_week", {}, accessToken);
                router.replace("/weekly/q/0");
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Alert.alert("dev_open_week error", message);
              }
            }}
          />
        )}
        <Button
          label="Sign out"
          variant="secondary"
          onPress={async () => {
            try {
              await supabase.auth.signOut();
            } catch {
              // ignore
            }
            resetIntakeState();
            await resetAppState();
            router.replace("/onboarding");
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#111214",
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 12,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  check: {
    width: 18,
    height: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
  },
  rowLabel: {
    fontFamily: "Inter_500Medium",
  },
  subhead: {
    marginTop: 8,
    fontFamily: "Inter_500Medium",
  },
  note: {
    marginTop: 8,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  quick: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
  },
  action: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  container: {
    flex: 1,
  },
  heading: {
    letterSpacing: 0.3,
  },
  body: {
    lineHeight: 22,
  },
});

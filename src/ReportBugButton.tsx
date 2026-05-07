import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { useReportBug } from "./useReportBug";

export interface ReportBugButtonProps {
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  label?: string;
  placeholder?: string;
  submitLabel?: string;
  cancelLabel?: string;
  onPress?: () => void;
  onReported?: (success: boolean, description?: string) => void;
}

export const ReportBugButton: React.FC<ReportBugButtonProps> = ({
  style,
  textStyle,
  label = "Report bug",
  placeholder = "What went wrong?",
  submitLabel = "Send",
  cancelLabel = "Cancel",
  onPress,
  onReported,
}) => {
  const { report, isReporting } = useReportBug();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const close = () => {
    setOpen(false);
    setText("");
  };

  const handlePress = () => {
    if (isReporting) return;
    if (onPress) return onPress();
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (isReporting) return;
    const description = text.trim() || undefined;
    const ok = await report(description);
    onReported?.(ok, description);
    if (ok) close();
  };

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label}
        activeOpacity={0.7}
        onPress={handlePress}
        style={[styles.button, style]}
      >
        <Text style={[styles.text, textStyle]}>{label}</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.backdrop}
        >
          <View style={styles.card}>
            <Text style={styles.title}>{label}</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={placeholder}
              placeholderTextColor="#888"
              multiline
              autoFocus
              editable={!isReporting}
              style={styles.input}
            />
            <View style={styles.row}>
              <TouchableOpacity
                onPress={close}
                disabled={isReporting}
                style={[styles.action, styles.cancel]}
              >
                <Text style={styles.actionText}>{cancelLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={isReporting}
                style={[styles.action, styles.submit]}
              >
                {isReporting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.actionText, styles.submitText]}>
                    {submitLabel}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    left: 12,
    bottom: 24,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.75)",
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
    marginBottom: 12,
  },
  input: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: "#111",
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
  },
  action: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
    minWidth: 72,
    alignItems: "center",
  },
  cancel: {
    backgroundColor: "#eee",
  },
  submit: {
    backgroundColor: "#111",
  },
  actionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111",
  },
  submitText: {
    color: "#fff",
  },
});

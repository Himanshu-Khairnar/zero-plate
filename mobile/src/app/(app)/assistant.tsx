import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View, type ScrollViewInstance } from "react-native";

import { useAssistant } from "@/api/hooks";
import { Button, Chip, Input, Screen, Text } from "@/components";
import { useOutlet } from "@/context/outlet";
import { radius, space, useTheme } from "@/theme";

type Msg = { id: number; role: "user" | "assistant" | "error"; text: string };

const SUGGESTIONS = ["What did we waste most this week?", "How much should we prep tomorrow?", "Which dishes are overproduced?"];

export default function AssistantScreen() {
  const { outlet } = useOutlet();
  const { colors } = useTheme();
  const ask = useAssistant();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const nextId = useRef(1);

  function send(text = input) {
    const message = text.trim();
    if (!message || ask.isPending) return;
    setInput("");
    setMessages((m) => [...m, { id: nextId.current++, role: "user", text: message }]);
    ask.mutate(message, {
      onSuccess: (r) => setMessages((m) => [...m, { id: nextId.current++, role: "assistant", text: r.reply }]),
      onError: (e) => setMessages((m) => [...m, { id: nextId.current++, role: "error", text: e instanceof Error ? e.message : "Failed." }]),
    });
  }

  return (
    <Screen title="AI Assistant" subtitle={outlet.name} back scroll={false}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <View style={{ gap: space.md }}>
              <Text variant="caption" tone="muted">
                Ask about this outlet's waste, prep, forecasts or sales. Each question is answered on its own.
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {SUGGESTIONS.map((s) => (
                  <Chip key={s} label={s} onPress={() => send(s)} />
                ))}
              </View>
            </View>
          ) : null}
          {messages.map((m) => {
            const mine = m.role === "user";
            return (
              <View
                key={m.id}
                style={{
                  alignSelf: mine ? "flex-end" : "flex-start",
                  maxWidth: "88%",
                  padding: space.md,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: m.role === "error" ? colors.destructive : mine ? colors.primary : colors.border,
                  backgroundColor: mine ? colors.primary : colors.card,
                }}
              >
                <Text variant="caption" tone={mine ? "inverse" : m.role === "error" ? "destructive" : "default"} selectable>
                  {m.text}
                </Text>
              </View>
            );
          })}
          {ask.isPending ? (
            <Text variant="caption" tone="muted">
              Thinking...
            </Text>
          ) : null}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: space.sm, padding: space.md, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>
            <Input value={input} onChangeText={setInput} placeholder="Ask a question" returnKeyType="send" onSubmitEditing={() => send()} />
          </View>
          <Button title="Send" onPress={() => send()} disabled={!input.trim()} loading={ask.isPending} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

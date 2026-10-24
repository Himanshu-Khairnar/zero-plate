import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { useLogWaste, useWasteOptions } from "@/api/hooks";
import { Button, Card, Chip, ErrorState, Input, Loading, Screen, Text } from "@/components";
import { useOutlet } from "@/context/outlet";
import { humanize } from "@/lib/format";
import { notify } from "@/lib/notify";
import { space } from "@/theme";

type Kind = "dish" | "ingredient";

export default function WasteLogScreen() {
  const { outletId } = useOutlet();
  const q = useWasteOptions();
  const log = useLogWaste();
  const [kind, setKind] = useState<Kind>("dish");
  const [itemId, setItemId] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const opts = q.data;
  const list = kind === "dish" ? (opts?.dishes ?? []).map((d) => ({ id: d.id, name: d.name, unit: "plates" })) : (opts?.ingredients ?? []);
  const selected = list.find((i) => i.id === itemId);
  const reasons = opts?.reasons ?? [];
  const activeReason = reason ?? reasons[0] ?? null;

  function submit() {
    const n = Number(qty.replace(",", "."));
    if (!selected) return setError(`Pick a ${kind}.`);
    if (!Number.isFinite(n) || n <= 0) return setError("Enter a quantity above 0.");
    if (!activeReason) return setError("Pick a reason.");
    setError(null);
    log.mutate(
      {
        outletId,
        ...(kind === "dish" ? { dishId: selected.id } : { ingredientId: selected.id }),
        qty: n,
        unit: selected.unit,
        reason: activeReason,
        note: note.trim() || undefined,
      },
      {
        onSuccess: () => {
          if (router.canGoBack()) router.back();
          else router.replace("/waste");
        },
        onError: (e) => notify("Could not log waste", e instanceof Error ? e.message : "Try again."),
      },
    );
  }

  return (
    <Screen title="Log waste" subtitle="Logged for today" back>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Card title="What was wasted">
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Chip label="Dish" selected={kind === "dish"} onPress={() => (setKind("dish"), setItemId(null))} />
              <Chip label="Ingredient" selected={kind === "ingredient"} onPress={() => (setKind("ingredient"), setItemId(null))} />
            </View>
            {list.length === 0 ? (
              <Text variant="caption" tone="muted">
                No {kind === "dish" ? "dishes" : "ingredients"} set up for this outlet.
              </Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {list.map((i) => (
                  <Chip key={i.id} label={i.name} selected={itemId === i.id} onPress={() => setItemId(i.id)} />
                ))}
              </View>
            )}
          </Card>

          <Card title="Quantity">
            <Input
              label={selected ? `Amount (${selected.unit})` : "Amount"}
              value={qty}
              onChangeText={setQty}
              keyboardType="decimal-pad"
              placeholder="0"
            />
          </Card>

          <Card title="Reason">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {reasons.map((r) => (
                <Chip key={r} label={humanize(r)} selected={activeReason === r} onPress={() => setReason(r)} />
              ))}
            </View>
            <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. burnt batch" />
          </Card>

          {error ? (
            <Text variant="caption" tone="destructive">
              {error}
            </Text>
          ) : null}
          <Button title="Save waste entry" size="lg" loading={log.isPending} onPress={submit} />
        </>
      )}
    </Screen>
  );
}

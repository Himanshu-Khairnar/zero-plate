import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { useKitchen, useKitchenLog } from "@/api/hooks";
import type { KitchenDish, Shift } from "@/api/types";
import { Badge, Button, Card, Chip, Empty, ErrorState, Loading, Screen, Text } from "@/components";
import { useOutlet } from "@/context/outlet";
import { num, shortDate } from "@/lib/format";
import { notify } from "@/lib/notify";
import { radius, space, useTheme } from "@/theme";

type Counts = { prepared: number; sold: number };

/** kitchen/log upserts one shift's row, so the steppers start from that shift's saved counts. */

export default function KitchenScreen() {
  const { outletId, outlet } = useOutlet();
  const q = useKitchen();
  const save = useKitchenLog();
  const [shift, setShift] = useState<Shift>(() => (new Date().getHours() < 16 ? "LUNCH" : "DINNER"));
  const [edits, setEdits] = useState<Record<string, Counts>>({});

  const date = q.data?.date ?? "";
  const locked = q.data?.locked ?? false;

  const baseFor = (dishId: string): Counts =>
    q.data?.dishes.find((d) => d.dishId === dishId)?.shifts[shift] ?? { prepared: 0, sold: 0 };
  const valueFor = (dishId: string): Counts => edits[dishId] ?? baseFor(dishId);

  const dirty = useMemo(() => Object.keys(edits), [edits]);

  function change(dishId: string, field: keyof Counts, delta: number) {
    setEdits((prev) => {
      const cur = prev[dishId] ?? baseFor(dishId);
      const next = { ...cur, [field]: Math.max(0, cur[field] + delta) };
      return { ...prev, [dishId]: next };
    });
  }

  function switchShift(s: Shift) {
    if (s === shift) return;
    if (dirty.length) notify("Unsaved changes discarded", `Switched to ${s.toLowerCase()}.`);
    setEdits({});
    setShift(s);
  }

  function onSave() {
    const rows = dirty.map((dishId) => ({ outletId, dishId, shift, ...edits[dishId] }));
    save.mutate(rows, {
      onSuccess: () => {
        setEdits({});
      },
      onError: (e) => notify("Save failed", e instanceof Error ? e.message : "Try again."),
    });
  }

  return (
    <Screen
      title="Kitchen"
      subtitle={`${outlet.name}${date ? ` · ${shortDate(date)}` : ""}`}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      right={locked ? <Badge label="Locked" tone="destructive" /> : null}
    >
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.dishes.length === 0 ? (
        <Empty title="No dishes" hint="Add dishes to the menu in the web app." />
      ) : (
        <>
          {locked ? (
            <Text variant="caption" tone="destructive">
              This day is locked. Counts are read-only.
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
            <Text variant="label" tone="muted">
              Shift
            </Text>
            {(["LUNCH", "DINNER"] as Shift[]).map((s) => (
              <Chip key={s} label={s === "LUNCH" ? "Lunch" : "Dinner"} selected={shift === s} onPress={() => switchShift(s)} disabled={locked} />
            ))}
          </View>
          <Text variant="caption" tone="muted">
            Steppers set this shift's counts; day totals (both shifts) are shown under each dish.
          </Text>

          {q.data.dishes.map((d) => (
            <DishRow
              key={d.dishId}
              dish={d}
              value={valueFor(d.dishId)}
              changed={!!edits[d.dishId]}
              disabled={locked || save.isPending}
              onChange={(field, delta) => change(d.dishId, field, delta)}
            />
          ))}

          <Button
            title={dirty.length ? `Save ${dirty.length} dish${dirty.length > 1 ? "es" : ""} · ${shift.toLowerCase()}` : "No changes"}
            size="lg"
            disabled={locked || dirty.length === 0}
            loading={save.isPending}
            onPress={onSave}
          />
          {dirty.length ? <Button title="Discard changes" variant="ghost" onPress={() => setEdits({})} /> : null}
        </>
      )}
    </Screen>
  );
}

function DishRow({
  dish,
  value,
  changed,
  disabled,
  onChange,
}: {
  dish: KitchenDish;
  value: Counts;
  changed: boolean;
  disabled: boolean;
  onChange: (field: keyof Counts, delta: number) => void;
}) {
  const { colors } = useTheme();
  return (
    <Card style={{ borderColor: changed ? colors.primary : colors.border }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
        <Text variant="heading" style={{ flex: 1 }} numberOfLines={2}>
          {dish.dishName}
        </Text>
        <Text variant="caption" tone="muted">
          target {num(dish.target)}
        </Text>
      </View>
      <Text variant="caption" tone="muted">
        Day: prepared {num(dish.prepared)} · sold {num(dish.sold)} · left {num(dish.leftover)}
      </Text>
      <View style={{ flexDirection: "row", gap: space.md }}>
        <Stepper label="Prepared" value={value.prepared} disabled={disabled} onChange={(d) => onChange("prepared", d)} />
        <Stepper label="Sold" value={value.sold} disabled={disabled} onChange={(d) => onChange("sold", d)} />
      </View>
    </Card>
  );
}

function Stepper({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (delta: number) => void }) {
  const { colors } = useTheme();
  const btn = (sign: 1 | -1) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${sign > 0 ? "Increase" : "Decrease"} ${label}`}
      disabled={disabled || (sign < 0 && value <= 0)}
      onPress={() => onChange(sign)}
      onLongPress={() => onChange(sign * 5)}
      style={({ pressed }) => ({
        width: 52,
        height: 52,
        borderRadius: radius.md,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: sign > 0 ? colors.primary : colors.secondary,
        opacity: disabled || (sign < 0 && value <= 0) ? 0.4 : pressed ? 0.75 : 1,
      })}
    >
      <Text weight="bold" style={{ fontSize: 26, lineHeight: 30, color: sign > 0 ? colors.primaryForeground : colors.foreground }}>
        {sign > 0 ? "+" : "−"}
      </Text>
    </Pressable>
  );
  return (
    <View style={{ flex: 1, gap: space.xs }}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.xs }}>
        {btn(-1)}
        <Text variant="value" style={{ minWidth: 40, textAlign: "center" }}>
          {value}
        </Text>
        {btn(1)}
      </View>
    </View>
  );
}

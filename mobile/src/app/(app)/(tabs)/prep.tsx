import { View } from "react-native";

import { useApprovePrepPlan, usePrepPlan } from "@/api/hooks";
import { Badge, Button, Card, Divider, Empty, ErrorState, Loading, Screen, Text } from "@/components";
import { useSession } from "@/context/auth";
import { useOutlet } from "@/context/outlet";
import { num, shortDate } from "@/lib/format";
import { confirm, notify } from "@/lib/notify";
import { space } from "@/theme";

export default function PrepScreen() {
  const { canApprove } = useSession();
  const { outlet } = useOutlet();
  const q = usePrepPlan(); // server default: tomorrow
  const approve = useApprovePrepPlan();
  const plan = q.data?.plan ?? null;
  const status = plan?.status ?? "NONE";
  const isDraft = status === "DRAFT";

  async function onApprove() {
    if (!plan) return;
    if (!(await confirm("Approve prep plan?", "The kitchen will cook to these quantities.", "Approve"))) return;
    approve.mutate(plan.id, {
      onError: (e) => notify("Approve failed", e instanceof Error ? e.message : "Try again."),
    });
  }

  return (
    <Screen
      title="Prep plan"
      subtitle={`${outlet.name} · ${plan ? shortDate(plan.date) : "tomorrow"}`}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      right={plan ? <Badge label={status} tone={isDraft ? "muted" : "primary"} /> : null}
    >
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !plan ? (
        <Empty title="No prep plan yet" hint="Tomorrow's plan hasn't been drafted. Generate it from the Prep page in the Zero Plate web app." />
      ) : (
        <>
          {isDraft && canApprove ? (
            <Card style={{ gap: space.sm }}>
              <Text variant="caption" tone="muted">
                Review quantities, then approve so the kitchen can prep to them.
              </Text>
              <Button title="Approve plan" loading={approve.isPending} onPress={onApprove} />
            </Card>
          ) : isDraft ? (
            <Text variant="caption" tone="muted">
              Waiting for an owner or manager to approve.
            </Text>
          ) : null}

          <Card title={`${plan.items.length} dishes`} right={<Text variant="label" tone="muted">forecast → plan</Text>}>
            {plan.items.length === 0 ? (
              <Text variant="caption" tone="muted">
                No items in this plan.
              </Text>
            ) : (
              plan.items.map((item, i) => (
                <View key={item.id} style={{ gap: space.md }}>
                  {i > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                    <Text style={{ flex: 1 }} numberOfLines={2}>
                      {item.dishName}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {num(item.forecastQty)}
                    </Text>
                    <Text weight="bold" style={{ minWidth: 56, textAlign: "right" }}>
                      {num(item.plannedQty)}
                      <Text variant="caption" tone="muted">
                        {" "}
                        {item.unit}
                      </Text>
                    </Text>
                  </View>
                </View>
              ))
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

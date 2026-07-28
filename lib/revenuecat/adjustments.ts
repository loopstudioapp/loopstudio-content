export type RevenueAdjustmentKind = "REFUND" | "REFUND_REVERSED";

export type RevenueAdjustmentEvent = {
  type?: string | null;
  price?: number | string | null;
  cancel_reason?: string | null;
};

export type RevenueAdjustment = {
  kind: RevenueAdjustmentKind;
  amount: number;
};

export function revenueAdjustmentFromEvent(
  event: RevenueAdjustmentEvent
): RevenueAdjustment | null {
  const price = Number(event.price || 0);
  const amount = Number.isFinite(price) ? Math.abs(price) : 0;

  if (event.type === "REFUND_REVERSED") {
    return { kind: "REFUND_REVERSED", amount };
  }

  if (
    event.type === "CANCELLATION" &&
    (event.cancel_reason === "CUSTOMER_SUPPORT" || price < 0)
  ) {
    return { kind: "REFUND", amount: -amount };
  }

  return null;
}

export function adjustmentKindFromLedgerId(
  id: string | null | undefined,
  revenue: number
): RevenueAdjustmentKind | null {
  if (id?.startsWith("refund_reversed:")) return "REFUND_REVERSED";
  if (id?.startsWith("refund:") || revenue < 0) return "REFUND";
  return null;
}

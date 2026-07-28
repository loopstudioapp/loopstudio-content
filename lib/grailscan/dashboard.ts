type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function fields(value: unknown, keys: string[]): JsonObject | null {
  const source = object(value);
  if (!source) return null;

  const result: JsonObject = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

function compactScanRequest(value: unknown): unknown {
  const request = object(value);
  if (!request) return value;

  return {
    id: request.id,
    user_id: request.user_id,
    status: request.status,
    stage: request.stage,
    identity: fields(request.identity, ["playerName", "cardNumber", "year", "setName"]),
    result: fields(request.result, ["referencePrice"]),
    error_code: request.error_code,
    created_at: request.created_at,
  };
}

function compactCard(value: unknown): unknown {
  const card = object(value);
  if (!card) return value;

  return {
    id: card.id,
    identity: fields(card.identity, [
      "playerName",
      "cardNumber",
      "year",
      "setName",
      "condition",
      "rarity",
      "parallel",
    ]),
    confidence: card.confidence,
    updated_at: card.updated_at,
    price_count: card.price_count,
    latest_price: fields(card.latest_price, ["price_usd"]),
  };
}

export function compactDashboardData(value: unknown): unknown {
  const data = object(value);
  if (!data || !Array.isArray(data.recent_requests)) return value;
  return {
    ...data,
    recent_requests: data.recent_requests.map(compactScanRequest),
  };
}

export function compactRecentScans(value: unknown): unknown {
  const data = object(value);
  if (!data || !Array.isArray(data.recent_requests)) return value;
  return {
    ...data,
    recent_requests: data.recent_requests.map(compactScanRequest),
  };
}

export function compactCardPage(value: unknown): unknown {
  const data = object(value);
  if (!data || !Array.isArray(data.cards)) return value;
  return {
    ...data,
    cards: data.cards.map(compactCard),
  };
}

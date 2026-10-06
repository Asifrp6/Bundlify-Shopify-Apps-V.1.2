// Rollouts were added in Admin GraphQL 2026-10. Discount reads use that version
// directly so the rest of the app can stay on 2026-07. Shopify applies a rollout
// before it runs the bundle discount function, which has no rollout input.

export const DISCOUNT_ROLLOUT_API_VERSION = "2026-10";
export const ROLLOUT_SCOPE = "read_rollouts";
const ROLLOUT_PAGE_SIZE = 10;
const CHANGE_PAGE_SIZE = 25;
const MAX_ROLLOUT_PAGES = 20;

const DISCOUNT_APP_FIELDS = `
  status
  startsAt
  endsAt
`;

const DISCOUNT_ROLLOUT_FIELDS = `
  status
  startsAt
  endsAt
  rollouts(first: ${ROLLOUT_PAGE_SIZE}, after: $cursor, query: "status:ACTIVE,SCHEDULED") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      name
      status
      schedule { activateAt concludeAt }
      startedAt
      concludedAt
      effectiveTrafficAllocation
      treatments {
        id
        split
        changes(first: ${CHANGE_PAGE_SIZE}, query: $changeFilter) {
          pageInfo { hasNextPage endCursor }
          nodes {
            __typename
            id
            ... on RolloutDiscountChange {
              discount { id }
            }
          }
        }
      }
    }
  }
`;

export const DISCOUNT_WINDOW_QUERY = `#graphql
  query BundleDiscountWindows($ids: [ID!]!) {
    nodes(ids: $ids) {
      id
      ... on DiscountAutomaticNode {
        automaticDiscount { ... on DiscountAutomaticApp { ${DISCOUNT_APP_FIELDS} } }
      }
      ... on DiscountNode {
        discount { ... on DiscountAutomaticApp { ${DISCOUNT_APP_FIELDS} } }
      }
    }
  }
`;

export const DISCOUNT_ROLLOUT_QUERY = `#graphql
  query BundleDiscountRollouts($id: ID!, $cursor: String, $changeFilter: String!) {
    node(id: $id) {
      id
      ... on DiscountAutomaticNode {
        automaticDiscount { ... on DiscountAutomaticApp { ${DISCOUNT_ROLLOUT_FIELDS} } }
      }
      ... on DiscountNode {
        discount { ... on DiscountAutomaticApp { ${DISCOUNT_ROLLOUT_FIELDS} } }
      }
    }
  }
`;

const VERIFY_ERROR = "Unable to verify saved offers after authentication. Please retry.";

export function hasReadRollouts(scopes) {
  const list = Array.isArray(scopes) ? scopes : String(scopes ?? "").split(",");
  return list.some(scope => scope.trim() === ROLLOUT_SCOPE);
}

export function discountChangeFilter(id) {
  const numeric = String(id ?? "").match(/(\d+)$/)?.[1];
  if (numeric) return `discount_id:${numeric}`;
  return `discount_id:'${String(id ?? "").replace(/'/g, "")}'`;
}

function numericId(id) {
  return String(id ?? "").match(/(\d+)$/)?.[1] || null;
}

function time(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatWhen(value) {
  const parsed = time(value);
  if (parsed == null) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(parsed));
}

function formatPercent(value) {
  const rounded = Math.round(Number(value) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function discountOwnActive(discount, now = new Date()) {
  const instant = now instanceof Date ? now.getTime() : typeof now === "number" ? now : time(now);
  const start = time(discount?.startsAt);
  const end = time(discount?.endsAt);
  if (!Number.isFinite(instant) || start == null) return discount?.status === "ACTIVE";
  if (instant < start) return false;
  if (end != null && instant >= end) return false;
  return true;
}

function rolloutIsServing(rollout, now) {
  if (rollout?.status !== "ACTIVE") return false;
  const concludeAt = time(rollout.schedule?.concludeAt);
  if (concludeAt != null && now >= concludeAt) return false;
  return true;
}

function treatmentEffect(treatment, discountId) {
  const expected = numericId(discountId);
  let activate = false;
  let expire = false;
  for (const change of treatment.changes || []) {
    const typename = change?.__typename;
    const discountChange = typename === "RolloutDiscountActivateChange" || typename === "RolloutDiscountExpireChange";
    if (discountChange && !change?.discountId) return "unknown";
    const actual = numericId(change?.discountId);
    if (actual && expected && actual !== expected) continue;
    if (typename === "RolloutDiscountActivateChange") activate = true;
    else if (typename === "RolloutDiscountExpireChange") expire = true;
    else if (change?.discountId == null && typename) return "unknown";
  }
  if (activate && expire) return "unknown";
  if (activate) return "activate";
  if (expire) return "expire";
  return "unchanged";
}

function ownDatesPhrase(discount) {
  const start = formatWhen(discount.startsAt);
  const end = formatWhen(discount.endsAt);
  if (start && end) return `This discount's own dates run ${start} through ${end}.`;
  if (start && !discount.endsAt) return `This discount's own dates start ${start} and stay open.`;
  if (start) return `This discount's own dates start ${start}.`;
  return "";
}

function rolloutReach(discount, rollout, now) {
  if (discount.rolloutsIncomplete || rollout.changesIncomplete) return { reach: null, restricted: true };
  const allocation = Number(rollout.effectiveTrafficAllocation);
  if (!Number.isFinite(allocation) || allocation < 0 || allocation > 100) return { reach: null, restricted: true };
  const ownActive = discountOwnActive(discount, now);
  if (allocation === 0) return { reach: ownActive ? 100 : 0, restricted: false };
  const treatments = Array.isArray(rollout.treatments) ? rollout.treatments : [];
  if (!treatments.length) return { reach: null, restricted: true };
  let splitSum = 0;
  let reach = ownActive ? 100 - allocation : 0;
  for (const treatment of treatments) {
    const split = Number(treatment.split);
    if (!Number.isFinite(split) || split < 0 || split > 100) return { reach: null, restricted: true };
    splitSum += split;
    const effect = treatmentEffect(treatment, discount.id);
    if (effect === "unknown") return { reach: null, restricted: true };
    const share = allocation * (split / 100);
    const included = effect === "activate" || (effect === "unchanged" && ownActive);
    if (included) reach += share;
  }
  if (Math.abs(splitSum - 100) > 0.05) return { reach: null, restricted: true };
  return { reach: Math.round(reach * 100) / 100, restricted: false };
}

function buyersFollowRolloutOnly(rollout, computed) {
  if (computed.restricted || Number(rollout.effectiveTrafficAllocation) !== 100) return false;
  return (rollout.treatments || []).every(treatment => {
    const effect = treatmentEffect(treatment, rollout.discountId);
    return effect === "activate" || effect === "expire";
  });
}

function nextChangeAt(discount, serving, now) {
  const times = [];
  const add = value => {
    const parsed = time(value);
    if (parsed != null && parsed > now) times.push(parsed);
  };
  const forced = serving.length === 1 && buyersFollowRolloutOnly({ ...serving[0], discountId: discount.id }, serving[0].computed || {});
  if (!forced) {
    add(discount.startsAt);
    add(discount.endsAt);
  }
  for (const rollout of discount.rollouts || []) {
    add(rollout.schedule?.activateAt);
    add(rollout.schedule?.concludeAt);
  }
  if (!times.length) return null;
  return new Date(Math.min(...times)).toISOString();
}

export function combineDiscountSchedule(discount, now = new Date()) {
  const instant = now instanceof Date ? now.getTime() : time(now) ?? Date.now();
  const rollouts = Array.isArray(discount?.rollouts) ? discount.rollouts : [];
  const ownActive = discountOwnActive(discount, instant);
  const serving = [];
  for (const rollout of rollouts) {
    if (!rolloutIsServing(rollout, instant)) continue;
    const computed = rolloutReach({ ...discount, rolloutsIncomplete: Boolean(discount?.rolloutsIncomplete) }, rollout, instant);
    serving.push({ ...rollout, computed });
  }
  let buyerReach = ownActive ? 100 : 0;
  let restricted = Boolean(discount?.rolloutsIncomplete);
  if (serving.length > 1) restricted = true;
  else if (serving.length === 1) {
    restricted = restricted || serving[0].computed.restricted;
    buyerReach = serving[0].computed.restricted ? null : serving[0].computed.reach;
  }
  if (!restricted && buyerReach != null && Math.abs(buyerReach - 100) < 0.001) buyerReach = 100;
  if (!restricted && buyerReach != null && buyerReach < 0.001) buyerReach = 0;
  const reachesEveryBuyer = !restricted && buyerReach === 100;
  const scheduled = rollouts
    .filter(rollout => rollout.status === "SCHEDULED" && !rolloutIsServing(rollout, instant))
    .sort((left, right) => (time(left.schedule?.activateAt) ?? Infinity) - (time(right.schedule?.activateAt) ?? Infinity));
  const note = adminNote({ ...discount, buyerReach, restricted }, serving, scheduled);
  const buyerNote = serving.length && !reachesEveryBuyer
    ? (buyerReach == null ? "Limited to selected buyers" : buyerReach <= 0 ? "Held during a live rollout" : `Live for ${formatPercent(buyerReach)}% of buyers`)
    : null;
  return {
    ownActive,
    buyerReach: restricted ? null : buyerReach,
    reachesEveryBuyer,
    nextChangeAt: nextChangeAt({ ...discount, rollouts }, serving, instant),
    note,
    buyerNote,
    limited: Boolean(serving.length) && !reachesEveryBuyer,
  };
}

function adminNote(discount, serving, scheduled) {
  if (serving.length > 1) {
    return "More than one live rollout includes this discount. Buyer reach stays limited to the buyers those rollouts include.";
  }
  if (serving.length === 1) {
    const rollout = serving[0];
    const until = formatWhen(rollout.schedule?.concludeAt);
    const untilText = until ? ` until ${until}` : "";
    const name = rollout.name || "A rollout";
    const dates = ownDatesPhrase(discount);
    if (discount.restricted || discount.buyerReach == null) {
      return `Rollout "${name}" is live${untilText}. This discount reaches the buyers included in that rollout. ${dates}`.trim();
    }
    const allocation = Number(rollout.effectiveTrafficAllocation);
    const allocationText = Number.isFinite(allocation) ? formatPercent(allocation) : null;
    const reachText = formatPercent(discount.buyerReach);
    const reachSentence = allocationText && allocationText !== reachText
      ? `Rollout "${name}" is live${untilText} with ${allocationText}% of buyer traffic. Combined with this discount's own dates, it reaches ${reachText}% of buyers.`
      : `Rollout "${name}" is live and reaches ${reachText}% of buyers${untilText}.`;
    return `${reachSentence} ${dates}`.trim();
  }
  const next = scheduled[0];
  if (!next) return null;
  const when = formatWhen(next.schedule?.activateAt);
  const name = next.name || "A rollout";
  return when
    ? `Rollout "${name}" is scheduled to start ${when}. Buyers follow this discount's own dates until then.`
    : `Rollout "${name}" is scheduled. Buyers follow this discount's own dates until it starts.`;
}

function accessDenied(error) {
  const graphqlErrors = error?.graphqlErrors || error?.body?.errors?.graphQLErrors || [];
  const text = `${error?.message || ""} ${graphqlErrors.map(item => `${item?.message || ""} ${item?.extensions?.code || ""}`).join(" ")}`;
  return /ACCESS_DENIED|access denied|read_rollouts/i.test(text);
}

async function graphql(admin, query, variables) {
  const response = await admin.graphql(query, { variables, apiVersion: DISCOUNT_ROLLOUT_API_VERSION });
  const result = await response.json();
  if (result.errors?.length) {
    const error = new Error(result.errors.map(item => item.message).filter(Boolean).join("; ") || VERIFY_ERROR);
    error.graphqlErrors = result.errors;
    throw error;
  }
  if (!result.data) throw new Error(VERIFY_ERROR);
  return result.data;
}

function availabilityFor(discount, id, now) {
  if (!discount || (discount.startsAt == null && discount.status == null)) return null;
  return combineDiscountSchedule({
    id,
    status: discount.status,
    startsAt: discount.startsAt,
    endsAt: discount.endsAt,
    rolloutsIncomplete: Boolean(discount.rolloutsIncomplete),
    rollouts: discount.rollouts || [],
  }, now);
}

async function readWindows(admin, ids, now) {
  const found = new Map();
  for (let offset = 0; offset < ids.length; offset += 250) {
    const batch = ids.slice(offset, offset + 250);
    const data = await graphql(admin, DISCOUNT_WINDOW_QUERY, { ids: batch });
    const nodes = data.nodes;
    if (!Array.isArray(nodes) || nodes.length !== batch.length || nodes.some((node, index) => node !== null && node?.id !== batch[index])) {
      throw new Error(VERIFY_ERROR);
    }
    nodes.forEach((node, index) => {
      const id = batch[index];
      if (!node?.id) {
        found.set(id, { present: false, availability: null });
        return;
      }
      found.set(id, { present: true, availability: availabilityFor(node.automaticDiscount || node.discount, id, now) });
    });
  }
  return found;
}

function normalizeRollout(rollout, changesIncomplete) {
  return {
    id: rollout.id,
    name: rollout.name,
    status: rollout.status,
    schedule: rollout.schedule || null,
    effectiveTrafficAllocation: rollout.effectiveTrafficAllocation,
    changesIncomplete,
    treatments: (rollout.treatments || []).map(treatment => ({
      id: treatment.id,
      split: treatment.split,
      changes: (treatment.changes?.nodes || []).map(change => ({
        __typename: change.__typename,
        discountId: change.discount?.id || null,
      })),
    })),
  };
}

async function readOneRolloutDiscount(admin, id, now) {
  const changeFilter = discountChangeFilter(id);
  const rollouts = [];
  let cursor = null;
  let rolloutsIncomplete = false;
  let discount = null;
  let present = false;
  for (let page = 0; page < MAX_ROLLOUT_PAGES; page += 1) {
    const data = await graphql(admin, DISCOUNT_ROLLOUT_QUERY, { id, cursor, changeFilter });
    const root = data.node || data.discountNode;
    if (!root?.id) {
      if (page === 0) return { present: false, availability: null };
      throw new Error(VERIFY_ERROR);
    }
    present = true;
    const appDiscount = root.automaticDiscount || root.discount;
    if (!appDiscount) return { present: true, availability: null };
    discount = appDiscount;
    const connection = appDiscount.rollouts;
    if (!connection?.pageInfo || !Array.isArray(connection.nodes)) throw new Error(VERIFY_ERROR);
    for (const rollout of connection.nodes) {
      const changesIncomplete = (rollout.treatments || []).some(treatment => treatment.changes?.pageInfo?.hasNextPage !== false);
      rollouts.push(normalizeRollout(rollout, changesIncomplete));
    }
    if (!connection.pageInfo.hasNextPage) {
      cursor = null;
      break;
    }
    cursor = connection.pageInfo.endCursor;
    if (!cursor) {
      rolloutsIncomplete = true;
      break;
    }
    if (page === MAX_ROLLOUT_PAGES - 1) rolloutsIncomplete = true;
  }
  if (cursor) rolloutsIncomplete = true;
  if (!present) return { present: false, availability: null };
  return {
    present: true,
    availability: availabilityFor({ ...discount, rollouts, rolloutsIncomplete }, id, now),
  };
}

async function readWithRollouts(admin, ids, now) {
  const found = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const index = cursor;
      cursor += 1;
      found.set(ids[index], await readOneRolloutDiscount(admin, ids[index], now));
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, () => worker()));
  return found;
}

export async function readBundleDiscounts(admin, ids, { scopes, now = new Date() } = {}) {
  const unique = [...new Set(ids.filter(id => typeof id === "string" && id))];
  if (!unique.length) return new Map();
  if (hasReadRollouts(scopes)) {
    try {
      return await readWithRollouts(admin, unique, now);
    } catch (error) {
      if (!accessDenied(error)) throw error;
    }
  }
  return readWindows(admin, unique, now);
}

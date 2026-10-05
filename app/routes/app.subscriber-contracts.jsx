import { authenticate } from "../shopify.server";
import { listSubscriberContracts } from "../services/subscription-portal.server";

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const after = new URL(request.url).searchParams.get("after");
  if (!after) return { subscriberPage: true, contracts: [], contractsAfter: null };
  try {
    const page = await listSubscriberContracts(admin, session.shop, { after });
    return { subscriberPage: true, contracts: page.contracts, contractsAfter: page.after };
  } catch {
    return { subscriberPage: true, contracts: [], contractsAfter: after };
  }
}

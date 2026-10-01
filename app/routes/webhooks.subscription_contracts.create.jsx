import { authenticate } from "../shopify.server";
import { handleContractCreated } from "../services/contract-length.server";

export const action = async ({ request }) => {
  const { admin, payload, shop } = await authenticate.webhook(request);
  return handleContractCreated({ admin, payload, shop });
};
export const loader = () => new Response(null, { status: 405, headers: { Allow: "POST" } });

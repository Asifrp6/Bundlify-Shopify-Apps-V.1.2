import { authenticate } from "../shopify.server";
import { listProductPlans } from "../services/plan-list.server";
import { reportRouteFailure } from "../services/route-diagnostics.server";

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function loader({ request }) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId") || "";
  if (!/^(?:gid:\/\/shopify\/Product\/)?\d+$/.test(productId))
    return json(
      { success: false, message: "A valid product ID is required", plans: [] },
      400,
    );
  // Proxy signature failures must not fall through to an unrelated admin login flow.
  const { admin } = url.searchParams.has("signature")
    ? await authenticate.public.appProxy(request)
    : await authenticate.admin(request);
  if (!admin)
    return json(
      { success: false, message: "Unable to authenticate Shopify", plans: [] },
      401,
    );
  try {
    const gid = productId.startsWith("gid://")
      ? productId
      : `gid://shopify/Product/${productId}`;
    const result = await listProductPlans(admin, gid);
    if (!result)
      return json(
        { success: false, message: "Product not found", plans: [] },
        404,
      );
    return json({ success: true, ...result });
  } catch (error) {
    if (error instanceof Response) throw error;
    reportRouteFailure(error, "subscription plans API");
    return json(
      {
        success: false,
        message: "Unable to load subscription plans",
        plans: [],
      },
      502,
    );
  }
}

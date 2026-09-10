import { authenticate } from "../shopify.server";
import { listProducts } from "../services/products.server";

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  return Response.json(await listProducts(admin), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

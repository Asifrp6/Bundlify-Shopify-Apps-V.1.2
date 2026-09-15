import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function loader({ request }) {
  const { admin, session } = await authenticate.public.appProxy(request);
  if (!admin || !session?.shop) return json({ bundles: [] }, 401);
  const productId = new URL(request.url).searchParams.get("productId");
  if (productId && !/^\d+$/.test(productId)) return json({ bundles: [] }, 400);
  try {
    const bundles = await prisma.bundle.findMany({
      where: { shop: session.shop, status: "ACTIVE", ...(productId ? { products: { some: { productId: `gid://shopify/Product/${productId}` } } } : {}) },
      include: { products: true }, orderBy: { createdAt: "desc" }, take: 12,
    });
    const ids = [...new Set(bundles.flatMap(b => b.products.map(p => p.productId)))];
    const products = new Map();
    for (let i = 0; i < ids.length; i += 250) {
      const response = await admin.graphql(`#graphql
        query BundleProducts($ids: [ID!]!) {
          nodes(ids: $ids) { ... on Product { id title handle status publishedAt } }
        }`, { variables: { ids: ids.slice(i, i + 250) } });
      const result = await response.json();
      if (result.errors?.length || !result.data?.nodes) throw new Error("Products unavailable");
      for (const p of result.data.nodes) if (p?.status === "ACTIVE" && p.publishedAt && new Date(p.publishedAt) <= new Date()) products.set(p.id, p);
    }
    return json({ bundles: bundles.filter(b => b.products.length >= 2 && b.products.every(p => products.has(p.productId))).map(b => ({
      id: String(b.id), discount: b.discountNodeId ? b.discount : 0, name: b.name, products: b.products.map(p => { const product = products.get(p.productId); return { title: product.title, handle: product.handle }; }),
    })) });
  } catch (error) {
    if (error instanceof Response) throw error;
    return json({ bundles: [] }, 502);
  }
}

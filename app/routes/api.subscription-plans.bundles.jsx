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
    let shopCurrency;
    for (let i = 0; i < ids.length; i += 250) {
      const response = await admin.graphql(`#graphql
        query BundleProducts($ids: [ID!]!) {
          shop { currencyCode }
          nodes(ids: $ids) { ... on Product { id title handle status publishedAt } }
        }`, { variables: { ids: ids.slice(i, i + 250) } });
      const result = await response.json();
      if (result.errors?.length || !result.data?.nodes) throw new Error("Products unavailable");
      shopCurrency = result.data.shop?.currencyCode;
      for (const p of result.data.nodes) if (p?.status === "ACTIVE" && p.publishedAt && new Date(p.publishedAt) <= new Date()) products.set(p.id, p);
    }
    return json({ bundles: bundles.flatMap(b => {
      const visible = b.products.filter(p => products.has(p.productId));
      if (visible.length < 2) return [];
      return [{
        id: String(b.id), discount: b.discountNodeId && b.discountType !== "fixed" ? b.discount : 0, discountType: b.discountType, fixedDiscount: b.discountNodeId && b.discountType === "fixed" ? b.discount : 0, shopCurrency, name: b.name,
        products: visible.map(p => { const product = products.get(p.productId); return { title: product.title, handle: product.handle }; }),
      }];
    }) });
  } catch (error) {
    if (error instanceof Response) throw error;
    return json({ bundles: [] }, 502);
  }
}

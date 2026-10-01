import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { loadStorefrontBundles, loadStorefrontGiftEnabled, loadStorefrontGiftOptions } from "../services/storefront-bundles.server";

const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function loader({ request }) {
  const { admin, session } = await authenticate.public.appProxy(request);
  if (!admin || !session?.shop) return json({ bundles: [] }, 401);
  try {
    const [bundles, giftOptions, giftEnabled] = await Promise.all([
      loadStorefrontBundles({ db: prisma, admin, shop: session.shop }),
      loadStorefrontGiftOptions({ db: prisma, shop: session.shop }),
      loadStorefrontGiftEnabled({ db: prisma, shop: session.shop }),
    ]);
    return json({ bundles, giftOptions, giftEnabled });
  } catch (error) {
    if (error instanceof Response) throw error;
    return json({ bundles: [] }, 502);
  }
}

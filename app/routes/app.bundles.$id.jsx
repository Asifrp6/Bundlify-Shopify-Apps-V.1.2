import { data } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getProducts, listProducts } from "../services/products.server";
import { validateBundle } from "../services/validation";

import { removeBundleDiscount } from "../services/bundle-discount.server";

export { default } from "./app.bundles.new";

async function findBundle(id, shop) {
  if (
    !/^[1-9]\d*$/.test(id || "") ||
    !Number.isSafeInteger(Number(id)) ||
    Number(id) > 2147483647
  )
    throw new Response("Not found", { status: 404 });
  const bundle = await prisma.bundle.findFirst({
    where: { id: Number(id), shop },
    include: { products: true },
  });
  if (!bundle) throw new Response("Not found", { status: 404 });
  return bundle;
}
export async function loader({ request, params }) {
  const { admin, session } = await authenticate.admin(request);
  const bundle = await findBundle(params.id, session.shop);
  try {
    return { bundle, products: await listProducts(admin), error: null };
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      bundle,
      products: [],
      error: "Products could not be loaded. Refresh the page to try again.",
    };
  }
}
export async function action({ request, params }) {
  const { admin, session, redirect } = await authenticate.admin(request);
  const bundle = await findBundle(params.id, session.shop);
  const form = await request.formData();
  const intent = form.get("intent");
  if (!["update", "delete"].includes(intent))
    return data({ error: "Invalid action." }, { status: 400 });
  if (intent === "delete") {
    if (form.get("confirmDelete") !== "yes")
      return data(
        { error: "Confirm deletion before continuing." },
        { status: 400 },
      );
    try { await removeBundleDiscount(admin, bundle); }
    catch (error) { return data({ error: error.message }, { status: 502 }); }
    await prisma.bundle.deleteMany({
      where: { id: bundle.id, shop: session.shop },
    });
    return redirect("/app/bundles?deleted=1");
  }
  const { values, errors } = validateBundle(form);
  if (Object.keys(errors).length) return data({ errors }, { status: 400 });
  let products;
  try {
    products = await getProducts(admin, values.productIds);
  } catch (error) {
    if (error instanceof Response) throw error;
    return data(
      { error: "Could not verify the selected products. Please try again." },
      { status: 502 },
    );
  }
  if (products.length !== values.productIds.length)
    return data(
      {
        errors: {
          productIds:
            "A selected product is no longer available. Select products again.",
        },
      },
      { status: 400 },
    );
  try {
    await removeBundleDiscount(admin, bundle);
    await prisma.bundle.update({
      where: { id: bundle.id, shop: session.shop },
      data: {
        status: "DRAFT",
        discountNodeId: null,
        name: values.name,
        discount: values.discount,
        discountType: values.discountType,
        products: {
          deleteMany: {},
          create: products.map((product) => ({
            productId: product.id,
            productTitle: product.title,
          })),
        },
      },
    });
  } catch {
    return data(
      { error: "The bundle draft could not be saved. Please try again." },
      { status: 500 },
    );
  }
  return redirect("/app/bundles?updated=1");
}

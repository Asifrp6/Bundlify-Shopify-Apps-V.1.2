import { data } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getProducts, listProducts } from "../services/products.server";
import { validateBundle } from "../services/validation";


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
  const limits = await (await import("../services/app-billing.server")).shopLimits(session.shop);
  try {
    return { bundle, products: await listProducts(admin), error: null, maxProducts: limits?.maxProducts ?? 5 };
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      bundle,
      products: [],
      error: "Products could not be loaded. Refresh the page to try again.",
      maxProducts: limits?.maxProducts ?? 5,
    };
  }
}
export async function action({ request, params }) {
  const { admin, session, redirect } = await authenticate.admin(request);
  const limits = await (await import("../services/app-billing.server")).shopLimits(session.shop);
  if (!limits) throw redirect("/app/pricing");
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
    const { removeBundleDiscount } = await import("../services/bundle-discount.server");
    try { await removeBundleDiscount(admin, bundle); }
    catch (error) { return data({ error: error.message }, { status: 502 }); }
    await prisma.bundle.deleteMany({
      where: { id: bundle.id, shop: session.shop },
    });
    return redirect("/app/bundles?deleted=1");
  }
  const publish = form.get("status") === "ACTIVE";
  if (!["ACTIVE", "DRAFT"].includes(String(form.get("status"))))
    return data({ error: "Choose draft or active before saving." }, { status: 400 });
  const { values, errors } = validateBundle(form, limits);
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
  const { createBundleDiscount, removeBundleDiscount } = await import("../services/bundle-discount.server");
  let updated;
  try {
    await removeBundleDiscount(admin, bundle);
    updated = await prisma.bundle.update({
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
      include: { products: true },
    });
  } catch {
    return data(
      { error: "The bundle could not be saved. Please try again." },
      { status: 500 },
    );
  }
  if (publish) {
    try {
      const discountNodeId = await createBundleDiscount(admin, updated);
      await prisma.bundle.update({ where: { id: updated.id }, data: { status: "ACTIVE", discountNodeId } });
    } catch (error) {
      return data({ error: `${error.message || "Could not activate this bundle."} It was saved as a draft.` }, { status: 502 });
    }
  }
  return redirect("/app/bundles?updated=1");
}

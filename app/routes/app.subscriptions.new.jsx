import DeliveryOptions from "../components/DeliveryOptions";
import {
  data,
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useRevalidator,
} from "react-router";

import {
  Banner,
  BlockStack,
  Button,
  Card,
  Page,
  Select,
  TextField,
} from "@shopify/polaris";

import { useState } from "react";

import { authenticate } from "../shopify.server";

import { listProducts, getProducts, productLoadFailure } from "../services/products.server";
import { validatePlan } from "../services/validation";
import { createSubscription } from "../services/subscriptions.server";
import prisma from "../db.server";

// ==========================
// LOADER
// ==========================

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  try {
    const products = await listProducts(admin);

    return data({
      products,
      error: null,
    });
  } catch (error) {
    // Authentication recovery responses must reach the router unchanged.
    if (error instanceof Response) throw error;
    const failure = productLoadFailure(error);
    console.error("[Bundlify product load]", {
      code: failure.code,
      status: failure.status,
    });

    return data({
      products: [],
      error: `${failure.message} (${failure.code})`,
    });
  }
}

// ==========================
// ACTION
// ==========================

export async function action({ request }) {
  // Authentication may throw a redirect; let React Router handle it.
  const { admin, session, redirect } = await authenticate.admin(request);
  const { values, errors } = validatePlan(await request.formData());
  if (Object.keys(errors).length) {
    return data({ error: Object.values(errors).join(" ") }, { status: 400 });
  }
  let product;
  try {
    if (values.productId === "ALL_PRODUCTS") {
      const catalog = await listProducts(admin);
      if (!catalog.length) return data({ error: "Add products before creating a subscription." }, { status: 400 });
      values.productIds = catalog.map(item => item.id);
      product = { title: "All products" };
    } else {
      [product] = await getProducts(admin, [values.productId]);
    }
  } catch {
    return data(
      { error: "Unable to verify the product. Please try again." },
      { status: 502 },
    );
  }
  if (!product) {
    return data(
      { error: "The selected product is no longer available." },
      { status: 400 },
    );
  }
  try {
    await createSubscription({
      prisma,
      admin,
      shop: session.shop,
      values,
      product,
    });
  } catch (error) {
    return data(
      {
        error:
          error.publicMessage ||
          "Could not create the subscription. Check your plan list before retrying.",
      },
      { status: 502 },
    );
  }
  return redirect("/app/subscriptions?created=1");
}

// ==========================
// FRONTEND
// ==========================

export default function NewSubscription() {
  const { products, error } = useLoaderData();

  const result = useActionData();

  const navigation = useNavigation();
  const revalidator = useRevalidator();

  const submitting = navigation.state !== "idle";

  const [name, setName] = useState("");

  const [options, setOptions] = useState([{ frequency: "Monthly", discount: 0 }]);


  const [productId, setProductId] = useState("");




  return (
    <Page
      title="Create Subscription Plan"

      backAction={{
        content: "Subscription Plans",
        url: "/app/subscriptions",
      }}
    >
      <Form method="post">
        <BlockStack gap="400">
          {error && (
            <Banner
              tone="critical"
              action={{
                content: "Retry loading products",
                onAction: () => revalidator.revalidate(),
                loading: revalidator.state !== "idle",
              }}
            >
              {error}
            </Banner>
          )}

          {result?.error && <Banner tone="critical">{result.error}</Banner>}

          {!products.length && !error && (
            <Banner>
              Add products in Shopify before creating a subscription.
            </Banner>
          )}
          <Card>
            <BlockStack gap="400">
              <TextField
                label="Plan Name"

                name="name"

                value={name}

                onChange={setName}

                placeholder="Monthly Coffee Subscription"
              />

              <DeliveryOptions options={options} onChange={setOptions} />
              <Select
                label="Product"
                helpText="All products applies to the current catalog. Products added later are not included automatically."

                name="productId"

                value={productId}

                onChange={setProductId}

                options={[
                  {
                    label: "Select Product",
                    value: "",
                  },
                  { label: "All products", value: "ALL_PRODUCTS" },

                  ...products.map((product) => ({
                    label: product.title,

                    value: product.id,
                  })),
                ]}
              />

              <Button
                submit

                variant="primary"

                loading={submitting}
                disabled={submitting || !productId || !products.length}
              >
                Create Subscription Plan
              </Button>
            </BlockStack>
          </Card>
        </BlockStack>
      </Form>
    </Page>
  );
}

import {
  Form,
  data,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  ChoiceList,
  Checkbox,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { listProducts, getProducts } from "../services/products.server";
import { validateBundle } from "../services/validation";

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  try {
    return { products: await listProducts(admin), error: null };
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      products: [],
      error: "Products could not be loaded. Refresh the page to try again.",
    };
  }
}

export async function action({ request }) {
  const { admin, session, redirect } = await authenticate.admin(request);
  const { values, errors } = validateBundle(await request.formData());
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
  if (products.length !== values.productIds.length) {
    return data(
      {
        errors: {
          productIds:
            "A selected product is no longer available. Refresh the page and select products again.",
        },
      },
      { status: 400 },
    );
  }
  try {
    await prisma.bundle.create({
      data: {
        shop: session.shop,
        name: values.name,
        discount: values.discount,
        products: {
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
  return redirect("/app/bundles?created=1");
}

export default function NewBundle() {
  const { products, bundle, error: loadError } = useLoaderData();
  const result = useActionData();
  const navigation = useNavigation();
  const [name, setName] = useState(bundle?.name || "");
  const [discount, setDiscount] = useState(String(bundle?.discount ?? 0));
  const [selected, setSelected] = useState(
    bundle?.products.map((product) => product.productId) || [],
  );
  const [confirm, setConfirm] = useState(false);
  const missingProducts = (bundle?.products || []).filter(
    (saved) => !products.some((product) => product.id === saved.productId),
  );
  const submitting = navigation.state !== "idle";
  return (
    <Page
      title={bundle ? "Edit bundle draft" : "Create bundle draft"}
      backAction={{ content: "Bundle drafts", url: "/app/bundles" }}
    >
      <Form method="post">
        {bundle && <input type="hidden" name="intent" value="update" />}
        <BlockStack gap="400">
          <Banner>
            This saves a draft offer. It does not apply a storefront or checkout
            discount.
          </Banner>
          {(loadError || result?.error) && (
            <Banner tone="critical">{loadError || result.error}</Banner>
          )}
          {products.length < 2 && !loadError && (
            <Banner>
              Add at least two products to your store to create a bundle.
            </Banner>
          )}
          <Card>
            <BlockStack gap="400">
              <TextField
                label="Bundle name"
                name="name"
                value={name}
                onChange={setName}
                autoComplete="off"
                maxLength={120}
                error={result?.errors?.name}
              />
              <ChoiceList
                title="Products"
                allowMultiple
                selected={selected}
                onChange={setSelected}
                choices={[
                  ...products.map((product) => ({
                    label: product.title,
                    value: product.id,
                  })),
                  ...missingProducts.map((product) => ({
                    label: `${product.productTitle} (no longer available; remove to save)`,
                    value: product.productId,
                  })),
                ]}
                error={result?.errors?.productIds}
              />
              {selected.map((id) => (
                <input key={id} type="hidden" name="productIds" value={id} />
              ))}
              <TextField
                label="Planned discount"
                name="discount"
                type="number"
                min={0}
                max={100}
                step={1}
                suffix="%"
                value={discount}
                onChange={setDiscount}
                autoComplete="off"
                error={result?.errors?.discount}
              />
              <Button
                submit
                variant="primary"
                loading={submitting}
                disabled={
                  !!loadError ||
                  selected.length < 2 ||
                  selected.length > 50 ||
                  submitting
                }
              >
                Save bundle draft
              </Button>
            </BlockStack>
          </Card>
        </BlockStack>
      </Form>
      {bundle && (
        <div id="delete-bundle">
          <Card>
            <Form method="post">
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Delete bundle draft
                </Text>
                <Text as="p">This permanently removes the saved draft.</Text>
                <Checkbox
                  label="I confirm I want to delete this draft"
                  checked={confirm}
                  onChange={setConfirm}
                />
                <input type="hidden" name="intent" value="delete" />
                <input
                  type="hidden"
                  name="confirmDelete"
                  value={confirm ? "yes" : "no"}
                />
                <Button
                  submit
                  variant="primary"
                  tone="critical"
                  disabled={!confirm || submitting}
                >
                  Delete draft
                </Button>
              </BlockStack>
            </Form>
          </Card>
        </div>
      )}
    </Page>
  );
}

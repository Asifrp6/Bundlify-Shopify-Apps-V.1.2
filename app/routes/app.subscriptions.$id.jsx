import DeliveryOptions from "../components/DeliveryOptions";
import { planOptions } from "../services/delivery-options";
import { data, Form, useLoaderData, useActionData, useNavigation } from "react-router";
import { Banner, BlockStack, Button, Card, Page, Text, TextField, Checkbox } from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { validatePlan } from "../services/validation";
import { changeSubscription } from "../services/subscription-management.server";

async function findPlan(id, shop) {
  if (!/^[1-9]\d*$/.test(id || "")) throw new Response("Not found", { status: 404 });
  const plan = await prisma.subscriptionPlan.findFirst({ where: { id: Number(id), shop }, include: { deliveryOptions: true } });
  if (!plan) throw new Response("Not found", { status: 404 });
  return plan;
}
export async function loader({ request, params }) {
  const { session } = await authenticate.admin(request);
  return { plan: await findPlan(params.id, session.shop) };
}
export async function action({ request, params }) {
  const { admin, session, redirect } = await authenticate.admin(request);
  const plan = await findPlan(params.id, session.shop);
  const form = await request.formData();
  const intent = form.get("intent");
  if (!["update", "delete"].includes(intent)) return data({ error: "Invalid action." }, { status: 400 });
  if (intent === "delete" && form.get("confirmDelete") !== "yes")
    return data({ error: "Confirm deletion before continuing." }, { status: 400 });
  form.set("productId", plan.productId);
  const { values, errors } = validatePlan(form);
  if (intent === "update" && Object.keys(errors).length)
    return data({ error: Object.values(errors).join(" ") }, { status: 400 });
  try {
    await changeSubscription({ prisma, admin, plan, values, remove: intent === "delete" });
  } catch (error) {
    if (error instanceof Response) throw error;
    return data({ error: error.message || "Unable to change the plan." }, { status: 502 });
  }
  return redirect(`/app/subscriptions?${intent === "delete" ? "deleted" : "updated"}=1`);
}
export default function EditSubscription() {
  const { plan } = useLoaderData();
  const result = useActionData();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const [name, setName] = useState(plan.name);
  const [options, setOptions] = useState(planOptions(plan));

  const [confirm, setConfirm] = useState(false);
  return <Page title="Edit subscription plan" backAction={{ content: "Subscription plans", url: "/app/subscriptions" }}>
    <BlockStack gap="400">
      {result?.error && <Banner tone="critical">{result.error}</Banner>}
      <Banner>Changes apply to the selling plan offered for future purchases. Existing customer subscription contracts are not changed or cancelled.</Banner>
      <Card><Form method="post"><BlockStack gap="300">
        <Text as="p">Product: {plan.productTitle || plan.productId}</Text>
        <TextField label="Plan name" name="name" value={name} onChange={setName} autoComplete="off" />
        <DeliveryOptions options={options} onChange={setOptions} />
        <input type="hidden" name="intent" value="update" />
        <Button submit variant="primary" disabled={busy}>Save changes</Button>
      </BlockStack></Form></Card>
      <div id="delete-plan"><Card><Form method="post"><BlockStack gap="300">
        <Text as="h2" variant="headingMd">Delete plan</Text>
        <Text as="p">Remove this selling plan from Shopify and your plan list. This cannot be undone.</Text>
        <Checkbox label="I confirm I want to delete this plan" checked={confirm} onChange={setConfirm} />
        <input type="hidden" name="confirmDelete" value={confirm ? "yes" : "no"} />
        <input type="hidden" name="intent" value="delete" />
        <Button submit tone="critical" variant="primary" disabled={busy || !confirm}>Delete plan</Button>
      </BlockStack></Form></Card></div>
    </BlockStack>
  </Page>;
}

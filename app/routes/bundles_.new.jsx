import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { redirect } = await authenticate.admin(request);
  return redirect(`/app/bundles/new${new URL(request.url).search}`);
}

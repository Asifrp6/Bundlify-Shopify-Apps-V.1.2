import { authenticate } from "../shopify.server";
export async function loader({ request }) {
  const { redirect } = await authenticate.admin(request);
  const url = new URL(request.url);
  return redirect(`/app/bundles/new${url.search}`);
}

import { redirect } from "react-router";
import { login } from "../../shopify.server";

export const loader = async ({ request }) => {
  const shop = new URL(request.url).searchParams.get("shop");
  if (!shop) throw redirect("/");
  await login(request);
  throw redirect("/");
};

export const action = () => {
  throw redirect("/");
};

export default function Auth() {
  return null;
}

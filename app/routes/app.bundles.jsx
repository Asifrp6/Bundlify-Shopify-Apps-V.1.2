import { Outlet } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
export const headers = (args) => boundary.headers(args);
export { default as ErrorBoundary } from "../components/RouteError";
export default function BundleLayout() {
  return <Outlet />;
}

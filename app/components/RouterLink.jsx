import { forwardRef } from "react";
import { Link } from "react-router";

// Polaris supplies `url`; React Router uses `to` for navigation without reloading the iframe.
const RouterLink = forwardRef(function RouterLink(
  // Polaris owns the link props contract.
  // eslint-disable-next-line react/prop-types
  { url, external, children, ...props },
  ref,
) {
  if (external || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) {
    return <a {...props} href={url} ref={ref}>{children}</a>;
  }
  return <Link {...props} to={url} ref={ref}>{children}</Link>;
});

export default RouterLink;

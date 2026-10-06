import { redirect } from "react-router";

// authenticate.admin().redirect() throws a status 200 App Bridge document, or a
// 401, for some embedded form posts. React Router renders that status as the
// page. This is a 302 the admin iframe follows back inside the app.
export function embeddedAppRedirect(pathname) {
  return redirect(pathname);
}

export function subscriptionSavedPath(intent) {
  return `/app/subscriptions?${intent === "delete" ? "deleted" : "updated"}=1`;
}

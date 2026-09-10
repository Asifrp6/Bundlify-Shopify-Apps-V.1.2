export function reportRouteFailure(error, stage) {
  if (error instanceof Response) return;
  // Never log request URLs, headers, response bodies, or session credentials.
  console.error("[Bundlify route failure]", {
    stage,
    name: error?.name || "UnknownError",
    status: error?.response?.code || error?.status || null,
    code: typeof error?.code === "string" ? error.code : null,
  });
}

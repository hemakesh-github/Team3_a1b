// A quote uses POST but is read-only. Only mutations can have an unknown outcome.
export function requestFailure(path, method) {
  const readOnly = method === "GET" || path === "/bookings/quote";
  if (readOnly)
    return new Error(
      "Could not load the requested information. Please try again.",
    );
  let message =
    "Connection interrupted. The request may have completed. Check the current state before trying again.";
  let recoveryHref, recoveryLabel;
  if (path === "/bookings") {
    message =
      "Connection interrupted. Your booking may have been created. Check your bookings before trying again.";
    recoveryHref = "/bookings";
    recoveryLabel = "Check bookings →";
  } else if (/^\/bookings\/[^/]+\/status$/.test(path)) {
    message =
      "Connection interrupted. The booking status may have changed. Reload its status before trying again.";
  } else if (/^\/bookings\/[^/]+\/review$/.test(path)) {
    message =
      "Connection interrupted. Your review may have been submitted. Check the saved review before trying again.";
  } else if (path === "/analytics/refresh") {
    message =
      "Connection interrupted. The summary may have refreshed. Reload the summary to check its refresh time.";
  } else if (path === "/search/sessions") {
    message =
      "Connection interrupted. The search pin may have been added. Refresh the pins before adding another.";
  }
  return Object.assign(new Error(message), {
    uncertain: true,
    recoveryHref,
    recoveryLabel,
  });
}

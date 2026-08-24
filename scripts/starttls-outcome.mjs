export function socketTimeoutOutcome(stage) {
  if (stage === "connect") {
    return { kind: "skip", reason: "timed out while connecting to port 25" };
  }
  return { kind: "error", reason: `timed out during ${stage}` };
}

import { Router, type IRouter } from "express";

const router: IRouter = Router();
const workerVerifyUrl = "https://deviationvalueweb.wang-elaine628.workers.dev/verify";
const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;
const requestWindows = new Map<string, { startedAt: number; count: number }>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRateLimited(clientKey: string, now: number) {
  const current = requestWindows.get(clientKey);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    requestWindows.set(clientKey, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}

router.post("/identity/verify", async (req, res): Promise<void> => {
  const authorization = req.get("authorization") ?? "";
  if (!/^Bearer\s+\S{20,8192}$/i.test(authorization)) {
    res.status(401).json({ error: "A valid Firebase ID token is required." });
    return;
  }

  const clientKey = req.ip || req.socket.remoteAddress || "unknown";
  if (isRateLimited(clientKey, Date.now())) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "Too many identity verification requests. Try again shortly." });
    return;
  }

  let workerResponse: Response;
  try {
    const origin = req.get("origin");
    workerResponse = await fetch(workerVerifyUrl, {
      method: "POST",
      headers: {
        Authorization: authorization,
        Accept: "application/json",
        ...(origin ? { Origin: origin } : {}),
      },
      signal: AbortSignal.timeout(9_000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    req.log.warn({ timedOut }, "Cloudflare Worker identity verification request failed");
    res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? "The identity verifier timed out."
        : "Could not reach the identity verifier.",
    });
    return;
  }

  let payload: unknown;
  try {
    payload = await workerResponse.json();
  } catch {
    req.log.warn({ workerStatus: workerResponse.status }, "Cloudflare Worker returned invalid verification JSON");
    res.status(502).json({ error: "The identity verifier returned an invalid response." });
    return;
  }

  if (!workerResponse.ok) {
    const workerError = isRecord(payload) && typeof payload.error === "string"
      ? payload.error
      : "";
    const originRejected = workerResponse.status === 403
      && /origin\s+not\s+allowed/i.test(workerError);
    const status = workerResponse.status === 401 ? 401 : workerResponse.status === 403 ? 403 : 502;
    req.log.warn({ workerStatus: workerResponse.status }, "Cloudflare Worker rejected identity verification");
    res.status(status).json({ error: originRejected
      ? "This site origin is not allowed by the Cloudflare Worker."
      : status === 401
        ? "The identity verifier rejected this Firebase ID token."
        : status === 403
          ? "The identity verifier rejected this request. Check the Worker origin allowlist and token validation."
          : "The identity verifier returned an unexpected response.",
    });
    return;
  }
  if (
    !isRecord(payload)
    || payload.verified !== true
    || typeof payload.uid !== "string"
    || payload.anonymous !== true
  ) {
    req.log.warn({ workerStatus: workerResponse.status }, "Cloudflare Worker returned an unexpected verification response");
    res.status(502).json({ error: "The identity verifier returned an unexpected response." });
    return;
  }

  res.status(200).json({
    verified: true,
    uid: payload.uid,
    anonymous: true,
  });
});

export default router;

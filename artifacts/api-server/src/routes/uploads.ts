import { Router, type IRouter } from "express";

const router: IRouter = Router();
const workerSignUrl = "https://deviationvalueweb.wang-elaine628.workers.dev/upload/sign";
const SIGN_TIMEOUT_MS = 12_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

router.post("/upload/sign", async (req, res): Promise<void> => {
  const authorization = req.get("authorization") ?? "";
  if (!/^Bearer\s+\S{20,8192}$/i.test(authorization)) {
    res.status(401).json({ error: "A valid Firebase ID token is required." });
    return;
  }

  const { submissionId, assetType, mimeType, bytes, publicConsent } = req.body ?? {};
  const validMime = assetType === "image"
    ? mimeType === "image/png"
    : assetType === "video" && (mimeType === "video/webm" || mimeType === "video/mp4");
  if (
    typeof submissionId !== "string"
    || !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(submissionId)
    || (assetType !== "image" && assetType !== "video")
    || !validMime
    || typeof bytes !== "number"
    || !Number.isSafeInteger(bytes)
    || bytes <= 0
    || bytes > 150 * 1024 * 1024
    || publicConsent !== true
  ) {
    res.status(400).json({ error: "Invalid public upload-sign request." });
    return;
  }

  const origin = req.get("origin");
  if (!origin) {
    res.status(400).json({ error: "The site origin is required for Worker verification." });
    return;
  }

  let workerResponse: Response;
  try {
    workerResponse = await fetch(workerSignUrl, {
      method: "POST",
      headers: {
        Authorization: authorization,
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ submissionId, assetType, mimeType, bytes, publicConsent }),
      signal: AbortSignal.timeout(SIGN_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    req.log.warn({ timedOut }, "Cloudflare Worker upload signing request failed");
    res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? "The upload-sign service timed out."
        : "Could not reach the upload-sign service.",
    });
    return;
  }

  let payload: unknown;
  try {
    payload = await workerResponse.json();
  } catch {
    req.log.warn({ workerStatus: workerResponse.status }, "Cloudflare Worker returned invalid upload-sign JSON");
    res.status(502).json({ error: "The upload-sign service returned an invalid response." });
    return;
  }

  if (!workerResponse.ok) {
    const workerError = isRecord(payload) && typeof payload.error === "string"
      ? payload.error
      : "The Worker rejected the upload-sign request.";
    req.log.warn({ workerStatus: workerResponse.status }, "Cloudflare Worker rejected upload signing");
    res.status(workerResponse.status).json({ error: workerError });
    return;
  }

  res.status(200).json(payload);
});

export default router;

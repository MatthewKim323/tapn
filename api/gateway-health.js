// Vercel Serverless Function — gateway health check
// The OpenClaw gateway runs locally on each user's machine, not on Vercel.
// This endpoint always returns 503 so the dashboard correctly shows "gateway offline".

export default function handler(req, res) {
  return res.status(503).json({ online: false, reason: "gateway runs locally" });
}

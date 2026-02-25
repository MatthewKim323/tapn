// Vercel Serverless Function — generates ElevenLabs signed URL
// Keeps the API key server-side so it never reaches the browser.

export default async function handler(req, res) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.VITE_ELEVENLABS_AGENT_ID;

  if (!apiKey || !agentId) {
    return res.status(500).json({ error: "ELEVENLABS_API_KEY or VITE_ELEVENLABS_AGENT_ID not set" });
  }

  try {
    const resp = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      { headers: { "xi-api-key": apiKey } }
    );

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: text });
    }

    const data = await resp.json();
    return res.status(200).json({ signedUrl: data.signed_url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

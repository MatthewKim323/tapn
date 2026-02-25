// Vercel Serverless Function — lists past ElevenLabs conversations

export default async function handler(req, res) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.VITE_ELEVENLABS_AGENT_ID;

  if (!apiKey || !agentId) {
    return res.status(500).json({ error: "keys not configured" });
  }

  try {
    const resp = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}`,
      { headers: { "xi-api-key": apiKey } }
    );
    const data = await resp.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

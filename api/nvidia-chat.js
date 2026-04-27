export default async function handler(request, response) {
  if (request.method === "OPTIONS") return cors(response, 204).end();
  if (request.method !== "POST") return cors(response, 405).json({ error: "Method not allowed" });

  try {
    const { apiKey, body } = request.body || {};
    if (!apiKey || !String(apiKey).startsWith("nvapi-")) {
      return cors(response, 400).json({ error: "A valid NVIDIA API key is required." });
    }

    const upstream = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    response.status(upstream.status);
    response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    return cors(response).send(text);
  } catch (error) {
    return cors(response, 500).json({ error: error.message || "NVIDIA proxy failed." });
  }
}

function cors(response, status) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (status) response.status(status);
  return response;
}

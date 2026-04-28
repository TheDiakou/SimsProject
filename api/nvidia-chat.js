export default async function handler(request, response) {
  if (request.method === "OPTIONS") return cors(response, 204).end();
  if (request.method !== "POST") return cors(response, 405).json({ error: "Method not allowed" });

  try {
    const { apiKey, body } = request.body || {};
    if (!apiKey || !String(apiKey).startsWith("nvapi-")) {
      return cors(response, 400).json({ error: "A valid NVIDIA API key is required." });
    }

    const wantsStream = Boolean(body?.stream);
    const upstream = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Accept: wantsStream ? "text/event-stream" : "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (wantsStream && upstream.ok && upstream.body) {
      response.status(upstream.status);
      response.setHeader("Content-Type", "text/event-stream");
      response.setHeader("Cache-Control", "no-cache, no-transform");
      cors(response);
      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        response.write(Buffer.from(value));
      }
      return response.end();
    }

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
  response.setHeader("Cache-Control", "no-cache, no-transform");
  if (status) response.status(status);
  return response;
}

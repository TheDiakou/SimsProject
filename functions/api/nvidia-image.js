const imageEndpoints = {
  "black-forest-labs/flux.1-dev": "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev",
  "black-forest-labs/flux.1-schnell": "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
  "black-forest-labs/flux.2-klein-4b": "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b",
  "stabilityai/stable-diffusion-3-medium": "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3-medium",
  "stabilityai/stable-diffusion-xl": "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl",
};

export async function onRequest(context) {
  const { request } = context;
  if (request.method === "OPTIONS") return cors(null, 204);
  if (request.method !== "POST") return cors({ error: "Method not allowed" }, 405);

  try {
    const { apiKey, model, body } = await request.json();
    if (!apiKey || !String(apiKey).startsWith("nvapi-")) {
      return cors({ error: "A valid NVIDIA API key is required." }, 400);
    }

    const endpoint = imageEndpoints[model];
    if (!endpoint) return cors({ error: "Unsupported image model." }, 400);

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: responseHeaders(upstream.headers.get("content-type") || "application/json"),
    });
  } catch (error) {
    return cors({ error: error.message || "NVIDIA image proxy failed." }, 500);
  }
}

function cors(payload, status = 200) {
  return new Response(payload ? JSON.stringify(payload) : null, {
    status,
    headers: responseHeaders("application/json"),
  });
}

function responseHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

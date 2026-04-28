export async function onRequest(context) {
  const { request } = context;
  if (request.method === "OPTIONS") return cors(null, 204);
  if (request.method !== "POST") return cors({ error: "Method not allowed" }, 405);

  try {
    const { apiKey, body } = await request.json();
    if (!apiKey || !String(apiKey).startsWith("nvapi-")) {
      return cors({ error: "A valid NVIDIA API key is required." }, 400);
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
    return new Response(text, {
      status: upstream.status,
      headers: responseHeaders(upstream.headers.get("content-type") || "application/json"),
    });
  } catch (error) {
    return cors({ error: error.message || "NVIDIA proxy failed." }, 500);
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

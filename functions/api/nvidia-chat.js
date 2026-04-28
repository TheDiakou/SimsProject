export async function onRequest(context) {
  const { request } = context;
  if (request.method === "OPTIONS") return cors(null, 204);
  if (request.method !== "POST") return cors({ error: "Method not allowed" }, 405);

  try {
    const { apiKey, body } = await request.json();
    if (!apiKey || !String(apiKey).startsWith("nvapi-")) {
      return cors({ error: "A valid NVIDIA API key is required." }, 400);
    }

    const wantsStream = Boolean(body?.stream);
    if (wantsStream) return streamNvidiaChat(apiKey, body);

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

function streamNvidiaChat(apiKey, body) {
  const encoder = new TextEncoder();
  const startedAt = Date.now();
  let heartbeat;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      const close = () => {
        clearInterval(heartbeat);
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      };

      send({ type: "status", message: "Cloudflare proxy connected. Waiting for NVIDIA to accept the request..." });
      heartbeat = setInterval(() => {
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        send({ type: "status", message: `Still connected. NVIDIA has been thinking for ${elapsed}s...` });
      }, 4000);

      fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      }).then(async (upstream) => {
        if (!upstream.ok) {
          const text = await upstream.text();
          send({ type: "error", message: `${upstream.status} ${text.slice(0, 900)}` });
          close();
          return;
        }

        send({ type: "status", message: "NVIDIA accepted the request. Streaming model output..." });
        if (!upstream.body) {
          send({ type: "error", message: "NVIDIA returned no stream body." });
          close();
          return;
        }

        const reader = upstream.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        close();
      }).catch((error) => {
        send({ type: "error", message: error.message || "NVIDIA stream failed." });
        close();
      });
    },
    cancel() {
      clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: responseHeaders("text/event-stream"),
  });
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
    "Cache-Control": "no-cache, no-transform",
  };
}

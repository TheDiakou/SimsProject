export async function onRequest(context) {
  const { request } = context;
  if (request.method === "OPTIONS") return cors(null, 204);
  if (request.method !== "POST") return cors({ error: "Method not allowed" }, 405);

  try {
    const { apiKey, body, fallbacks = [] } = await request.json();
    if (!apiKey || !String(apiKey).startsWith("nvapi-")) {
      return cors({ error: "A valid NVIDIA API key is required." }, 400);
    }

    const wantsStream = Boolean(body?.stream);
    if (wantsStream) return streamNvidiaChat(apiKey, body, fallbacks);

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

function streamNvidiaChat(apiKey, body, fallbacks) {
  const encoder = new TextEncoder();
  const startedAt = Date.now();
  let heartbeat;
  let sawModelBytes = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      const close = () => {
        clearInterval(heartbeat);
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      };

      send({ type: "status", message: `Cloudflare proxy connected. Requesting ${body.model}...` });
      heartbeat = setInterval(() => {
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        const message = sawModelBytes
          ? `Still streaming. ${elapsed}s elapsed since the request started...`
          : `Still connected. NVIDIA has not emitted model output yet after ${elapsed}s...`;
        send({ type: "status", message });
      }, 4000);

      runModelsSequentially(apiKey, [body, ...fallbacks], send, (chunk) => {
        sawModelBytes = true;
        controller.enqueue(chunk);
      }).then((ok) => {
        if (!ok) send({ type: "error", message: "No NVIDIA text model returned output. Try the image generator or local room engine." });
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

async function runModelsSequentially(apiKey, bodies, send, writeChunk) {
  for (let index = 0; index < bodies.length; index += 1) {
    const body = bodies[index];
    const label = index === 0 ? "selected model" : "fallback model";
    send({ type: "status", message: `Trying ${label}: ${body.model}` });
    const ok = await tryStreamModel(apiKey, body, send, writeChunk, index === 0 ? 18000 : 26000);
    if (ok) return true;
  }
  return false;
}

async function tryStreamModel(apiKey, body, send, writeChunk, firstByteTimeoutMs) {
  const aborter = new AbortController();
  const firstByteTimer = setTimeout(() => aborter.abort("first-byte-timeout"), firstByteTimeoutMs);

  try {
    const upstream = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: aborter.signal,
    });

    if (!upstream.ok) {
      clearTimeout(firstByteTimer);
      const text = await upstream.text();
      send({ type: "status", message: `${body.model} returned ${upstream.status}: ${text.slice(0, 500)}` });
      return false;
    }

    if (!upstream.body) {
      clearTimeout(firstByteTimer);
      send({ type: "status", message: `${body.model} returned no stream body.` });
      return false;
    }

    send({ type: "status", message: `${body.model} accepted the request. Waiting for first token...` });
    const reader = upstream.body.getReader();
    let sawChunk = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!sawChunk) {
        sawChunk = true;
        clearTimeout(firstByteTimer);
        send({ type: "status", message: `${body.model} started streaming output.` });
      }
      writeChunk(value);
    }
    clearTimeout(firstByteTimer);
    return sawChunk;
  } catch (error) {
    clearTimeout(firstByteTimer);
    const timedOut = error?.name === "AbortError" || String(error).includes("first-byte-timeout");
    send({ type: "status", message: timedOut ? `${body.model} produced no bytes within ${Math.round(firstByteTimeoutMs / 1000)}s; trying fallback.` : `${body.model} failed: ${error.message || error}` });
    return false;
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
    "Cache-Control": "no-cache, no-transform",
  };
}

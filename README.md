# SimRooms Studio

An interactive Sims-inspired room simulator. Describe a Sim or room vibe and get a stylized 3D room, object lore, model-assisted concept art, and a build list to recreate in The Sims.

## Run Locally

Use any static file server from this directory:

```sh
python -m http.server 5173
```

Then open `http://localhost:5173`.

## NVIDIA Key

The app can call NVIDIA's OpenAI-compatible chat completions endpoint if the user enters their own API key. It also includes image model choices for concept art generation through NVIDIA's model-specific visual endpoints.

The Cloudflare proxy uses JavaScript `fetch()` against the same endpoint shown in NVIDIA's OpenAI SDK and Node examples: `https://integrate.api.nvidia.com/v1/chat/completions`.

The text-model picker intentionally only includes GLM 5.1 (`z-ai/glm-5.1`). Direct testing showed tiny GLM 5.1 prompts can start streaming in roughly 15 seconds, while larger structured room JSON prompts may take 30-120 seconds before the first token.

The key is not stored unless the user enables "Remember locally", and then it is stored only in that browser's `localStorage`.

Do not hardcode API keys in this project.

If no key is entered, the app uses a local procedural generator for the 3D room. Concept art requires a live NVIDIA image model call.

Important: GitHub Pages is static and NVIDIA does not allow direct browser calls from it due to CORS. To make live NVIDIA calls work for free, deploy this repo to Cloudflare Pages so the included `/api/nvidia-chat` and `/api/nvidia-image` proxy functions can call NVIDIA server-side while still letting the visitor paste their own key at runtime.

## Deploy With Live NVIDIA Calls

Deploy to Cloudflare Pages from this repository. No server-side API key is required because the visitor enters their own key in the UI and the Pages Function only proxies that request to NVIDIA.

```sh
npx wrangler pages deploy . --project-name simrooms-studio
```

GitHub Pages remains useful as a static demo with the local room generator, but it cannot perform the live NVIDIA requests.

## Sharing

This is a static site and can be hosted on GitHub Pages, Netlify, Vercel, Cloudflare Pages, or any plain web server.

## Files

- `index.html`: app shell, model selectors, and CDN imports
- `styles.css`: responsive awwwards-inspired UI styling
- `app.js`: Three.js room rendering, prompt generation, NVIDIA model calls, concept art, and fallback generator
- `functions/api/nvidia-chat.js`: Cloudflare Pages Function proxy for chat completions
- `functions/api/nvidia-image.js`: Cloudflare Pages Function proxy for image generation
- `api/nvidia-chat.js`: Vercel-compatible proxy, kept as an alternate deployment path
- `api/nvidia-image.js`: Vercel-compatible image proxy, kept as an alternate deployment path

# Jackfruit Pika API Worker

Cloudflare Worker proxy for Pika Business API video generation. Supabase remains the database and asset store; video model credentials and requests live here.

## Local setup

1. Install dependencies from this directory with `npm install`.
2. Create an ignored `.dev.vars` file containing `PIKA_API_KEY=...`.
3. Add the local frontend origins to `ALLOWED_ORIGINS` in `wrangler.jsonc`.
4. Run `npm run dev:api` from the repository root.
5. Set `VITE_CF_API_URL` in both frontend deployment environments.

## Deploy

Set the secret and deploy using the project scripts:

```sh
npx wrangler secret put PIKA_API_KEY
npm run deploy:api
```

Update `ALLOWED_ORIGINS` with the exact production Character and Admin app origins before deployment.

## Endpoints

- `GET /health`
- `POST /v1/videos`
- `GET /v1/videos/:id`
- `GET /v1/videos/:id/content`

The configured models are `pika/v2.2/image-to-video` and `pika/v2.2/pikaframes`.

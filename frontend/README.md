This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Backend contract for `POST /transfers`

The frontend calls `createTransfer()` in `lib/kobo/api.ts`, which runs against a mock
implementation until `NEXT_PUBLIC_KOBO_API_URL` is set (see `.env.example`). Once the
real endpoint exists, the response must match:

```ts
CreateTransferResponse & { onramp: OnrampSession }

interface OnrampSession {
  transferId: string;
  provider: 'transak';
  checkoutUrl?: string;           // hosted checkout redirect path
  widgetConfig?: Record<string, unknown>; // embedded iframe path - must include `embedUrl`
  expiresAt?: string;             // ISO timestamp; frontend re-requests if already past
}
```

Exactly one of `checkoutUrl` / `widgetConfig.embedUrl` should be set — the frontend
picks the redirect or embedded flow at runtime based on whichever is present.

**Still needed from backend/Transak config, before this can point at the real thing:**

- The exact fields `widgetConfig` should carry beyond `embedUrl` (if the frontend needs
  to read anything out of it directly, rather than just using it as an iframe `src`).
- Transak's real `postMessage` origin(s) for the environment actually wired up
  (`lib/kobo/onramp-transak.ts` currently allowlists Transak's publicly documented
  `https://global.transak.com` / `https://global-stg.transak.com` — unverified against
  this integration) and the exact event names/payload shape for order-created /
  order-successful / order-failed / widget-closed (currently assumed to be Transak's
  documented `TRANSAK_ORDER_CREATED` etc. `event_id` values).
- Whether the `redirectURL` Transak is configured with appends a `?status=` query param
  distinguishing success/cancelled/failed. `app/transfers/[id]/return/page.tsx` currently
  treats `status=cancelled`/`status=failed` as hints and otherwise defaults to polling
  `watchTransferStatus` for a confirmed status — it never claims success without one.

In mock mode, `app/transfers/mock-widget/page.tsx` stands in for Transak's hosted
widget so the embedded flow can be exercised end-to-end locally.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

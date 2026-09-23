# Family Hub integration — 23 September 2026

Baby Record is now available at `https://oc-family-hub.vercel.app/baby`.

- `app/baby/page.tsx` re-exports the existing root page. Keep one implementation of the tracker.
- `next.config.ts` uses `assetPrefix: "/baby-assets"`. The public asset rewrite also serves icons under this namespace. Preserve both; without them, the Hub and Baby Record's Next.js bundles can collide.
- Family Hub proxies `/baby` and `/baby-assets/*` to this Vercel project, preserving the browser's Hub origin. No iframe or cross-domain redirect is involved.
- Metadata uses the root `/manifest.webmanifest`: on the Hub origin it is Family Hub's single manifest; on the original origin it remains Baby Record's existing manifest.
- The existing Family Hub button navigates in the same window and retains its unsaved-form confirmation. On the Hub origin it goes to `/`; on the original origin it goes to `https://oc-family-hub.vercel.app/`.
- Do not register a new root service worker on the Hub origin. The Hub owns offline fallback and never caches records or authenticated HTML.
- The original `/`, `/mcp`, `/.well-known/oauth-protected-resource`, and `/oauth/consent` remain available on `hc-record.vercel.app`. ChatGPT integrations continue using that original domain. Do not change their canonical OAuth/MCP URLs as part of UI navigation work.
- No database, PIN, RLS, or Supabase Auth settings were changed. Sessions and language preferences do not automatically transfer from the original origin; family members may need their existing PIN once on the Hub origin.

## Future changes

Continue editing the tracker normally in this repo. Deployment to the existing `hc-record` Vercel project updates the proxied module automatically. No second child deployment or separate build mode is needed. Keep `/baby` available. New UI subpages must be provided under `/baby/...`, and new public asset URLs must use `/baby-assets/...`. The Hub already proxies these path prefixes.

Cross-app navigation must be a plain anchor or `window.location.assign`, in the same window. Do not use Next.js client routing to cross into the Hub or Finance application.

## Verification

Production build, lint, type-check, and 14 unit tests passed. The Hub smoke check validates the mounted page, script/style namespaces, icons and shared manifest. Run `npm run test:zones` from the Family Hub repository after deployment. Actual installed iPhone behaviour requires a physical device check. No production baby records were created or edited for this migration.

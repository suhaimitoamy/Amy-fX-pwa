# Publish Status

Target platform: iPhone, iPad, Android browser, and desktop browser.

Production entry:

```text
https://suhaimitoamy.github.io/Amy-fX-pwa/
```

Static hosting: GitHub Pages from `main` and repository root.

Dynamic backend:

```text
https://amy-fx.vercel.app
```

Authentication:

```text
https://wliecyxzlwhmtftnfnps.supabase.co/functions/v1/pwa-auth
```

The `pwa-auth` Edge Function is active, accepts browser CORS requests, and handles login, session refresh, validation, and logout.

Production validation covers the GitHub Pages project path, manifest, service worker, member gates, Journal loading order, module routes, and removal of Android build workflows.

Web Push remains disabled until a subscription backend and VAPID configuration are deployed.

# Thela

Thela is a link-in-bio store for Indian creators who sell by Instagram DM. Buyers pay the creator's own UPI, every order gets its own code, and Thela takes nothing from the sale. Live at [thela.site](https://thela.site).

## What's here
- `thela.html`: the landing page source.
- `pages/`: other pages (About, privacy and founding creator terms).
- `stores/`: the store page template, the demo store's settings and the QR code library ([qrcode.js](stores/vendor/qrcode.js), MIT licence).
- `scripts/build.ps1`: builds everything into `site/`. It checks each store file and refuses to build one with mistakes.
- `scripts/serve.ps1`: a small local preview server (PowerShell, no Python or Node needed).
- `scripts/store-test.js` and `scripts/shots.js`: a full demo order and phone-width screenshots, run with playwright-cli.
- `site/`: the built website. Netlify publishes this folder as it is, with no build step.

## How it's built
Plain HTML, CSS and vanilla JavaScript. No framework. It works at 360px wide, in light and dark mode.

The site has no backend. Applications go through Netlify Forms, and buyers pay creators directly by UPI, so Thela never holds anyone's money.

## Deploying
Run `scripts/build.ps1`, commit, and push to `main`. Netlify deploys `site/` to thela.site.

Run by Salooja Digital, Delhi NCR. Contact: aryan200284@gmail.com.

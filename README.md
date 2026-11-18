# Sajin Shivdas · profile

Live at **https://me.sajinshivdas.online**. A single scroll story told by one WebGL particle system, with the same pages and transitions as the site analysed in [ANALYSIS.md](ANALYSIS.md). It is reimplemented from scratch: no code, text, shaders or point clouds were copied.

| # | Page | Particles |
|---|---|---|
| – | Preloader with a % counter | held on a slowly turning ring |
| 1 | Hero: name left, role right | portrait (your photo, or a silhouette until you upload one); turns towards the pointer and glows |
| 2 | Statement, revealed word by word | portrait turns away |
| 3 | Globe with two captions on a ring; drag to spin both | spinning sphere |
| 4 | "From India", pinned to the map | India |
| 5 | "Based in the UAE", pinned to Abu Dhabi | zoomed-in UAE with islands and glowing cities |
| 6 | How I work | diagonal two-strand ribbon |
| 7 | Selected works with thumbnails, sliding along the ribbon | ribbon keeps rolling |
| 8 | Closing line | spiral |
| 9 | Contact: email, links, footer | a frame drawn around the email |

Smooth scrolling is [Lenis](https://github.com/darkroomengineering/lenis) and rendering is [three.js](https://threejs.org) (both MIT, vendored in `public/vendor`). Fonts are self-hosted. Visitors who prefer reduced motion get the content without the preloader or smooth scrolling.

## Admin panel

`/admin` signs in with `ADMIN_PASSWORD`. You can edit every page (hero, statement, globe captions, the two map labels, how I work, selected works, contact links, footer), the site title, description and colours, and:

- **Portrait particles:** upload a head-and-shoulders photo. It's converted to particles in your browser, with sliders for background cut-off, contrast and particle count, and a live preview. Only the points are uploaded.
- **Project thumbnails:** each project can have a thumbnail (uploads are resized to 800×500 in the browser and stored in the data volume). The five starting projects ship with screenshots of their sites.
- **Backups:** every save keeps a backup (the latest 50). Restore any of them, export or import the content as JSON, or reset to the original text.

Security: HttpOnly, Secure, SameSite=Strict session cookie; a CSRF header on every write; login rate limiting (5 failures lock an IP out for 15 minutes); links must be `https://`, `http://` or `mailto:`; strict Content Security Policy.

## Deploy (Hostinger Docker Manager + Traefik)

The VPS project `sajin-profile` runs `docker-compose.hostinger.yml`. It uses the stock `node:24-alpine` image and downloads this repository at the commit in `APP_REF` when it starts, then serves on port 8080 behind the existing Traefik (`websecure` entrypoint, `letsencrypt` resolver) for `me.sajinshivdas.online`. Content and the portrait live in the `sajin-profile-data` volume, so they survive redeploys.

Project environment variables: `ADMIN_PASSWORD` (required) and `APP_REF` (the commit to run). To ship new code, set `APP_REF` to the new commit and redeploy the project in Docker Manager.

## Develop

```bash
npm run dev      # http://localhost:8080, admin password "dev"
npm test         # content validation + admin API tests
```

No npm dependencies; Node.js 22 or newer.

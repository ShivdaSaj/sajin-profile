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

## Themes

Four themes, each with its own colours and effects, all editable under **Themes & effects** in the admin panel:

| Theme | Look |
|---|---|
| Dark | the original look; the maps can switch to a night view |
| Light | dark particles on a light page |
| Black & Neon | black page, glowing cyan-to-magenta particles, glowing text |
| Matrix | digital rain behind the page, particles drawn as code glyphs that rain down between pages and on load, text that decodes itself, monospace font |

**Night-view maps** (dark themes): India and the UAE are drawn as seen from orbit at night, with dim land and glowing cities (and the UAE's main highways) in a configurable city-light colour.

**Display mode** (whole page): **Particle**, the original crisp particles and sliding text, or **Gaseous**, where every shape turns to slowly curling smoke, a soft coloured mist drifts behind the page and text blurs into focus. **Auto** alternates between the two at an interval you set.

Visitors can't change the theme or mode; you choose them under **Themes & effects** in the admin: a fixed theme (optionally Light for visitors whose device is in light mode), or **auto rotation** through the themes marked "In auto rotation", in order or at random, at an interval from 10 seconds to 24 hours. Rotation follows the clock, so every visitor sees the same theme at the same time, and open pages change live. Each theme's colours, particle style (soft dots, neon glow, code glyphs), gradient, glow strength, page transition (morph or code rain), text effect (fade or decode), glowing text, monospace font, digital rain (density and speed) and night maps can be changed, as can the smoke puff size and flow speed. `/?theme=matrix&mode=gaseous` previews any combination.

Smooth scrolling is [Lenis](https://github.com/darkroomengineering/lenis) and rendering is [three.js](https://threejs.org) (both MIT, vendored in `public/vendor`). Fonts are self-hosted. Visitors who prefer reduced motion get the content without the preloader or smooth scrolling.

## Admin panel

`/admin` signs in with `ADMIN_PASSWORD` (or a password set in the panel, see below). You can edit every page (hero, statement, globe captions, the two map labels, how I work, selected works, contact links, footer), the site title and description, the themes, and:

- **Portrait particles:** upload a head-and-shoulders photo. It's converted to particles in your browser, with sliders for background cut-off, contrast and particle count, and a live preview. Only the points are uploaded.
- **Project thumbnails:** each project can have a thumbnail (uploads are resized to 800×500 in the browser and stored in the data volume). The five starting projects ship with screenshots of their sites.
- **Admin password:** set a panel password and choose the sign-in mode: only the `.env` password, only the panel password (it overrides `.env`), or either. Changing it needs the current password and signs out other sessions. The panel password is stored as a salted scrypt hash in `auth.json` in the data volume, never in the public content or the backups. Locked out? Set `ADMIN_FORCE_ENV=true` in the project environment and redeploy: only the `.env` password works until you set it back to `false`.
- **Backups:** every save keeps a backup (the latest 50). Restore any of them, export or import the content as JSON, or reset to the original text.

Security: HttpOnly, Secure, SameSite=Strict session cookie; a CSRF header on every write; login rate limiting (5 failures lock an IP out for 15 minutes); links must be `https://`, `http://` or `mailto:`; strict Content Security Policy.

## Deploy (Hostinger Docker Manager + Traefik)

The VPS project `sajin-profile` runs `docker-compose.hostinger.yml`. It uses the stock `node:24-alpine` image and downloads this repository at the commit in `APP_REF` when it starts, then serves on port 8080 behind the existing Traefik (`websecure` entrypoint, `letsencrypt` resolver) for `me.sajinshivdas.online`. Content and the portrait live in the `sajin-profile-data` volume, so they survive redeploys.

Project environment variables: `ADMIN_PASSWORD` (required), `APP_REF` (the commit to run) and optionally `ADMIN_FORCE_ENV` (`true` to ignore the panel password, for recovery). To ship new code, set `APP_REF` to the new commit and redeploy the project in Docker Manager.

## Develop

```bash
npm run dev      # http://localhost:8080, admin password "dev"
npm test         # content, themes, admin API and password tests
```

No npm dependencies; Node.js 22 or newer.

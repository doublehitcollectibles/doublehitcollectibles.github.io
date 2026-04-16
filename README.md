# Doublehit Collectibles

Doublehit Collectibles is a Pokemon trading card brand and content site run by Braden Lee (`0x00C0DE`).

This repository powers the GitHub Pages site for brand updates, collecting highlights, release notes, and Pokemon TCG-focused posts.

## About The Site

The site is built to showcase:

- Pokemon trading card collecting updates
- featured posts and homepage artwork for the Doublehit Collectibles brand
- blog-style content around releases, pickups, hobby news, and collecting highlights

## Repo Structure

Some of the most important folders and files:

- `_posts/` for published posts
- `_layouts/` and `_includes/` for page structure and reusable site sections
- `_sass/` for styling
- `assets/` for compiled CSS, JavaScript, and site images
- `src/` for source images, JavaScript, and YAML config inputs used by the build pipeline
- `.github/workflows/pages.yml` for GitHub Pages deployment

## Local Development

Install dependencies:

```bash
bundle install
npm install
```

Run the asset + Jekyll build:

```bash
npm run build
```

For local development with file watching:

```bash
npm run dev
```

If you want to run Jekyll directly after dependencies are installed:

```bash
bundle exec jekyll serve
```

## Content Workflow

To publish new Pokemon TCG content:

1. Add a new Markdown post in `_posts/`.
2. Set the title, subtitle, date, and image in the front matter.
3. Use images from `assets/img/` or source them through `src/img/` if they should be part of the build pipeline.
4. Commit the change and push it to `main` to deploy the live site.

## Deployment

The site deploys through GitHub Pages.

- pushes to `main` trigger the Pages workflow
- `doublehit-v1` is used as a working branch when making changes before syncing them to `main`

## Brand

Doublehit Collectibles is the public-facing brand for this site.

- Brand name: `Doublehit Collectibles`
- Maintainer: `Braden Lee`
- Online handle: `0x00C0DE`
- Focus: `Pokemon trading cards`

## License

This repository includes upstream Jekyll theme foundations plus custom Doublehit Collectibles branding and content. See [LICENSE](LICENSE) for the license terms used in this repo.

# CLAUDE.md — Imgproxy-With-Cache

## Overview

A small Express + TypeScript media server that browses a media tree and serves on-the-fly resized/optimized images. Resize/transcode work is delegated to a **darthsim/imgproxy sidecar** (invoked over HTTP, not via `docker exec`); transformed bytes are streamed to an on-disk **cache** so repeat requests are served straight from disk. The same server-rendered EJS listing UI doubles as a live demo of the cache/resize pipeline. Media sources can be the local filesystem or AWS S3.

**Tech stack:** Node 18 · TypeScript 4.8 (CommonJS, ES6 target) · Express 4 · EJS views (Bootstrap 5) · node-fetch · `@aws-sdk/client-s3` v3 · ESLint + typescript-eslint · Docker + docker-compose · GitHub Actions → GHCR. Current version: **1.1.2**.

> Docker is effectively required for development and runtime because imgproxy runs as a sibling container and the app calls it at the hard-coded hostname `imgproxy:8080`. There is no standalone (non-Docker) mode for the transform path.

## Architecture & request flow

Everything is served by **one** Express catch-all route, `app.get("/*", ...)` in [src/index.ts:14](src/index.ts#L14). There are no other routes, routers, or verb handlers.

1. **Decode + path build** — `reqPath = decodeURI(req.path)` ([index.ts:15](src/index.ts#L15)), logged, then joined to `mediaPath = path.join(__dirname, '..', 'media', reqPath)` ([index.ts:18](src/index.ts#L18)). Media root is hard-coded as `<compiled-dir>/../media`; **reqPath is not sanitized for `..` traversal**.
2. **File-vs-folder dispatch (by extension)** — if `validFiles.includes(path.extname(reqPath))` ([index.ts:20](src/index.ts#L20)), the request is a **file** → `validateFile(reqPath, req.query, res, mediaPath)` (early return). `validFiles` = lowercase extensions from the `Formats` enum: `.png .jpg .webp .avif .gif .ico .bmp .tiff .pdf`. Otherwise it is treated as a **folder** request — but only after the existence check below.
3. **Folder listing** — `exisPath(mediaPath)` gates a `404` (empty body). Non-S3: `existsSync` + `lstatSync(...).isDirectory()` (so a non-matching extension that is *not* an existing directory → 404, not a listing); S3: always `true`. On success, `await getDataFromFolder(mediaPath, reqPath)` returns `{ folders, files }` (local: `getLocalData`; S3: `listBucketObjects(reqPath)`). A breadcrumb is built purely by string-splitting `reqPath` (no FS access), seeded with a `home` crumb, last crumb `active`. Renders `res.render("layout", { appUrl, path: relativePath, folders, foldersArray: breadcrumb, files })`. Note: the **breadcrumb is passed as `foldersArray`**, separate from the `folders` list.
4. **File serving** (inside [src/validateFile.ts](src/validateFile.ts), async): (a) `/favicon.ico` → 404; (b) `!existsSync(mediaPath) && !useS3` → 404; (c) **zero-query short-circuit** — `Object.keys(query).length === 0` serves the original (local `res.sendFile`; S3 `downloadS3File` → pipe `Body`); (d) **PDF placeholder** — `.pdf` *with* query params → serve `views/pdf-file.png` and return (PDFs are never proxied); (e) build `EncodeOptions` from query.
5. **Cache hit/miss** — key `md5 = createHash('md5').update(JSON.stringify(encoding)).digest('hex') + '.' + format`; `cachePath = path.join(__dirname, '..', 'cache', md5)`. Hit: `if (existsSync(cachePath)) res.sendFile(cachePath)` (imgproxy never called). Miss: `await throttler.callFunction(() => compress(encoding, md5))`; on **any** throw a bare `catch` serves `views/error-file.png` (HTTP 200, not an error status).
6. **Imgproxy invocation + concurrency gate** — `compress` is wrapped by a `Semaphore` ([src/semaphore.ts](src/semaphore.ts)), default concurrency **1**, so all compressions serialize. [compress.ts](src/compress.ts) builds `http://imgproxy:8080/insecure/<urlParams>plain/...@<format>`, `fetch`es it, throws on `!response.ok`, and stream-pipes the body into `createWriteStream(cachePath)`.
7. **S3 case** — gated by `useS3`. The app's own S3 client ([s3.ts](src/s3.ts)) is used **only** for directory listing and raw download. **Transforms bypass `s3.ts`**: `compress.ts` builds an `s3://${awsBucketName}/...` URL and imgproxy pulls from S3 itself (via `IMGPROXY_USE_S3`).

### Sidecar relationship
The Node app and imgproxy share the same media volume and AWS env vars over the Docker network. The app reaches imgproxy at the Compose service hostname `imgproxy` on port 8080, in **`/insecure/`** (unsigned) mode — no signing key configured.

## Key files & directories

> Several source names are **misspelled**; the misspellings are load-bearing for grep. Do not "fix" them casually — every import references the misspelled name.

| Path | Job |
|------|-----|
| [src/index.ts](src/index.ts) | Entry point. Express + EJS setup, the single `/*` route, file/folder dispatch, breadcrumb, `app.listen`. No exports. |
| [src/config.ts](src/config.ts) | `dotenv.config()` + exported config constants (`port`, `appUrl`, `useS3`, `aws*`). Fail-fast S3 credential guard (throws at startup if `USE_AWS_S3=true` and any `AWS_*` missing). |
| [src/validateFile.ts](src/validateFile.ts) | Request validation, query→`EncodeOptions`, MD5 cache key, cache-hit short-circuit, placeholder/error dispatch. Owns the module-level `Semaphore` throttler. Helpers: `isFormat`, `isValidResizeType`, `getRGB`, `hexToRgb`. Default export `validateFile`. |
| [src/compress.ts](src/compress.ts) | Builds the imgproxy URL, fetches transformed bytes via node-fetch, streams to cache file. Default export `compress`. |
| [src/getFiltes.ts](src/getFiltes.ts) | **(misspelled — should be `getFiles`)** Directory-browsing layer. Exports `validFiles`, type `foldersFileType`, `getDataFromFolder`, **`exisPath`** (also misspelled). Local backend `getLocalData` (not exported). Dispatches to S3 when `useS3`. |
| [src/s3.ts](src/s3.ts) | AWS S3 read path. `downloadS3File` (single object stream) and `listBucketObjects` (paginated `ListObjectsCommand`, `Delimiter '/'`). |
| [src/semaphore.ts](src/semaphore.ts) | `Semaphore` class — concurrency throttle that gates `compress`. |
| [src/types/index.ts](src/types/index.ts) | Shared enums/types: `Formats`, `ResizingType` (member **`fillDdown = 'fill-down'`** — double `d`), `BackgroundRGB`, `Resize`, `EncodeOptions`, `Breadcrumb`. |
| [src/views/pages/layout.ejs](src/views/pages/layout.ejs) | Top-level rendered template (`res.render("layout", ...)`). Includes `head`, `./pagination`, `footer`. |
| [src/views/pages/pagination.ejs](src/views/pages/pagination.ejs) | **Misnamed** — it is the actual page body (title, breadcrumb, folder grid, image grid). No pagination logic at all. |
| [src/views/partials/gridImages.ejs](src/views/partials/gridImages.ejs) | Image-card grid; thumbnails point back at this server with imgproxy query params. |
| [src/views/partials/head.ejs](src/views/partials/head.ejs) / [footer.ejs](src/views/partials/footer.ejs) | `<head>` (Bootstrap 5.2.2 CDN + inline CSS) / static "Copyright 2022 Sefirosweb" footer. |
| [tools/copyAssets.ts](tools/copyAssets.ts) | `shell.cp("-R", "src/views", "dist/")` — ships EJS templates + placeholder PNGs alongside compiled JS. Run via ts-node, outside the `tsc` `include`. |
| [docker/Dockerfile](docker/Dockerfile) | Two-stage build (node:18.12-bullseye). |
| [docker/start-container](docker/start-container) | Bash entrypoint → `node /home/app/dist/index.js`. |
| [docker-compose.yml](docker-compose.yml) | Dev stack (idling app container + imgproxy sidecar). |
| [production/docker-compose.yml](production/docker-compose.yml) | Production stack (prebuilt GHCR image + sidecar). |
| [.github/workflows/publish.yml](.github/workflows/publish.yml) | CI: build + push image to GHCR on `v1.*` tags. |

Runtime directories (each has a `.gitignore` that ignores its own contents): `media/` (source files) and `cache/` (transformed output). Both placeholder images (`error-file.png`, `pdf-file.png`) live in `src/views/`.

## Environment variables

The app reads env via `dotenv`. The `??` defaults only apply to `undefined`/`null` (an empty string is **not** defaulted in the TS code, whereas Compose `${VAR:-default}` *does* treat empty as unset).

| Name | Default | Required when |
|------|---------|---------------|
| `APP_PORT` | `8080` | optional. **Only maps the host port in Compose** (`${APP_PORT:-8080}:8080`); it is *not* injected into the container env, so the app inside always listens on 8080. |
| `APP_URL` | `http://localhost:${port}` | optional; embedded in every generated link/thumbnail in the EJS views. |
| `USE_AWS_S3` | `false` (matched as exact string `=== 'true'`) | optional; switches the app to S3 mode. |
| `AWS_REGION` | — | when `USE_AWS_S3=true` (startup throws if missing). |
| `AWS_BUCKET_NAME` | — | when `USE_AWS_S3=true`. |
| `AWS_ACCESS_KEY_ID` | — | when `USE_AWS_S3=true` (consumed by the AWS SDK default credential chain; **not** passed to the `S3Client` explicitly — the client only gets `{ region }`). |
| `AWS_SECRET_ACCESS_KEY` | — | when `USE_AWS_S3=true` (same as above). |
| `NODE_ENV` | — | present in `.env.example` / Docker but **never read in app code**. |
| `DEBUG_PORT` | — | dev-only; used by the dev Compose port map (9229). |
| `MAX_CONCURRENT_COMPRESION` | `1` | optional; **misspelled** (single `S`). Read in [validateFile.ts](src/validateFile.ts), **not** in `config.ts`, and **not** wired through either Compose file. |
| `MEDIA_PATH` | `./media` | production Compose only; **not** in `.env.example`. |

Imgproxy-side env (set in Compose, not by the app): `IMGPROXY_USE_S3` (`${USE_AWS_S3:-false}`), `IMGPROXY_LOCAL_FILESYSTEM_ROOT=/media`, `IMGPROXY_MAX_SRC_RESOLUTION="9999"`.

> `.env.example` is incomplete for real use: it omits `MEDIA_PATH`, `APP_URL`, `USE_AWS_S3`, and all `AWS_*`.

## Supported URL query params

All transforms are driven by the query string on a file request, parsed in [validateFile.ts](src/validateFile.ts):

| Param | Type / format | Default | Notes |
|-------|---------------|---------|-------|
| `format` | one of the `Formats` values | `jpg` | output format / cache file extension |
| `width` | `parseInt(…,10)` | — | **mandatory to trigger any resize**; without it, height/enlarge/extend/resizing_type are all ignored |
| `height` | `parseInt(…,10)` | — | only applied if `width` (resize) is present |
| `enlarge` | `'1'`/`'0'` (string) | `'0'` | **only forwarded to imgproxy when a `height` is present** |
| `extend` | `'1'`/`'0'` (string) | `'0'` | same height caveat |
| `resizing_type` | `fit` `fill` `fill-down` `force` `auto` | `fit` | only applied if resize is present |
| `background_rgb` | strict 6-hex `/^#?([a-f\d]{2}){3}$/i` | — | 3-digit shorthand / named colors silently ignored |
| `quality` | `parseInt(…,10)` | — | passed straight through |

Zero query params ⇒ original file served unchanged. **Any** non-empty query (even an unknown key) bypasses the short-circuit and triggers a transform (default `jpg`). No clamping/validation on width/height/quality — `NaN` and arbitrarily large values flow straight into the imgproxy URL.

## Development workflow

Docker is required (imgproxy sidecar + the `imgproxy` hostname). The dev app container **idles** via `entrypoint: ["tail","-f","/dev/null"]` — you exec in and start the app yourself.

```bash
docker compose up -d                # start idling app container + imgproxy sidecar
npm run dockerrun                   # = docker-compose exec -u node app_imgproxy bash
# then, inside the container:
npm install
npm run dev                         # ts-node + nodemon, inspector on 0.0.0.0:9229
```

- `npm run dev` = `nodemon --watch src -e ts --exec "node --inspect=0.0.0.0:9229 --require ts-node/register src/index.ts"` — runs TS directly, **no build/copy step**.
- Debug port **9229** (inspector bound to all interfaces; a VSCode "attach" config exists in [.vscode/launch.json](.vscode/launch.json), `remoteRoot: /home/app`).
- `npm run dev:start` = `npm-run-all build start` (full build, then run compiled output).
- `npm run start` = `node .` (resolves `package.json "main": "dist/index.js"`).
- Legacy variants exist: `dev:old`, `dockerrun:old` (raw `docker run` on **node:16.13** — mismatched vs the 18.12 used everywhere else).

## Build & deploy

`npm run build` = `npm-run-all clean lint tsc copy-assets`, **sequential, in this order**:
1. `clean` — `rimraf dist/*`
2. `lint` — `eslint "src/**/*.ts"` (check-only; the build no longer mutates source — run `npm run lint:fix` to autofix)
3. `tsc` — compile `src/**/*` → `dist/` (commonjs, es6, `noImplicitAny`, sourcemaps)
4. `copy-assets` — `ts-node tools/copyAssets` → `shell.cp("-R","src/views","dist/")` (only `src/views` is shipped)

> Views resolve relative to `__dirname` of the **compiled** output: `<dist>/views/pages`. EJS rendering and the placeholder PNGs only work after `copy-assets` (or via ts-node in dev).

**Docker** (`docker build -f docker/Dockerfile .`): two stages, both `node:18.12-bullseye`. Stage `appbuild` runs `npm ci` + `npm run build` (devDeps like TypeScript available there). Final stage sets `NODE_ENV=production`, copies `dist`, `package*.json`, and `start-container`, runs **`npm ci --omit=dev`** (reproducible install, runtime deps only), `EXPOSE 8080`, `ENTRYPOINT ["start-container"]`. `start-container` **`exec`s** node so it becomes PID 1 and receives `SIGTERM`/`SIGINT` for graceful shutdown.

**CI** ([.github/workflows/publish.yml](.github/workflows/publish.yml)): triggers **only** on `v1.*` git tags (a `v2.x` tag would not publish). `checkout@v3` → `login-action@v2` to **ghcr.io** (`github.actor` + `GITHUB_TOKEN`) → `build-push-action@v4` (context `.`, file `docker/Dockerfile`, `push: true`). The image is **always** tagged only `ghcr.io/sefirosweb/imgproxywithcache:latest` — no version-pinned tag, `:latest` is overwritten each release (intentional: no space to keep per-version images). The README's manual `docker push` instructions use Docker-Hub-style names + version tags and are out of sync with CI.

**Production run:** `docker compose -f production/docker-compose.yml up -d`.

## Conventions

- **TypeScript / lint:** ESLint (`eslint:recommended` + `plugin:@typescript-eslint/recommended`) via `.eslintrc.json`; `no-console` and `@typescript-eslint/no-explicit-any` are turned **off** (the code logs to console intentionally and uses `any` for query params). `npm run lint` is **check-only** and runs inside `build`, so the build never mutates source; use `npm run lint:fix` to autofix manually. `tsconfig` has **`strict: true`**; `paths` maps `*` → `node_modules/*`; no `exclude`.
- **No tests:** `npm test` is the placeholder `echo "Error: no test specified" && exit 1`. There are **no automated tests** anywhere.
- **Types style:** string enums for `Formats`/`ResizingType`; object shapes as `type` aliases (not interfaces); boolean-ish flags typed as the string-literal union `'1' | '0'`; `BackgroundRGB` fields are `string`.
- **Views:** server-rendered EJS + Bootstrap 5. README `### TODOS` slates the EJS layer for replacement by **Vue** ("Improve to Vue instead EJS"), plus a search input and batch pre-compression.
- **Naming:** image/registry name is all-lowercase `imgproxywithcache` under owner `sefirosweb`. Colon-namespaced script variants (`dev`, `dev:start`, `dev:old`, `dockerrun`, `dockerrun:old`).
- **Misspellings to grep on (intentional in code — do not blindly rename):** `getFiltes`, `exisPath`, `fillDdown`, `MAX_CONCURRENT_COMPRESION` / `Compresion`.

## Gotchas & footguns

- **Hard-coded paths:** media root `path.join(__dirname,'..','media',reqPath)` and cache dir `path.join(__dirname,'..','cache',md5)` are not env-configurable. The cache-path join is **duplicated independently** in `validateFile.ts` and `compress.ts` — they must stay in sync.
- **Path traversal guard:** [src/index.ts](src/index.ts) resolves the request path and returns `404` for anything that escapes the `media/` root, *before* any FS access (`sendFile`/`exisPath`/`getDataFromFolder`). This guard is the only thing confining requests to `media/` — preserve it if you refactor the routing.
- **`NODE_TLS_REJECT_UNAUTHORIZED: "0"`** is hard-coded in the **dev** Compose only (disables all TLS cert verification for the Node process). It is absent in production — do not copy it across.
- **Cache invalidation:** key is `md5(JSON.stringify(encoding))` — it depends on `EncodeOptions` key insertion order, so adding/reordering fields in code silently invalidates the whole cache. There is **no cache eviction/TTL**: if a source image changes, the stale transformed copy is served forever until `cache/` is cleared by hand. Unknown query params still bump `Object.keys` > 0, creating a (possibly redundant) cache entry.
- **Concurrency limit:** default `MAX_CONCURRENT_COMPRESION = 1` serializes all compressions through a single semaphore permit — a throughput bottleneck under load.
- **Weak/missing error handling:** the compress `catch` is a bare `catch {}` that swallows everything and serves `error-file.png` with HTTP 200 (no logging at the call site). No try/catch around `res.render`/`getDataFromFolder` in `index.ts`. `downloadS3File` swallows **all** errors → `null` → generic 404 (a real misconfig is indistinguishable from a missing object). 404 responses have empty bodies.
- **Resize requires width:** `validateFile` only builds a `resize` when `width` is present, so `height`/`enlarge`/`extend`/`resizing_type` are ignored if you pass them without a `width`. (`enlarge`/`extend` now apply correctly even without a `height` — `compress.ts` emits the full positional imgproxy `resize:type:width:height:enlarge:extend`.)
- **PDFs are never transformed:** `.pdf` + query params → static `pdf-file.png`; `.pdf` with no query params falls through to the raw-file branch.
- **S3 asymmetry:** the app's `S3Client` is created with only `{ region }` (credentials come from the SDK default chain — the `awsAccessKeyId`/`awsSecretAccessKey` exports are effectively unused on the app side). `exisPath` is a no-op `true` in S3 mode. The imgproxy sidecar's S3 env omits `AWS_BUCKET_NAME`. If `IMGPROXY_USE_S3` and `USE_AWS_S3` disagree, listing/download can work while transforms fail (or vice versa).
- **`IMGPROXY_MAX_SRC_RESOLUTION="9999"`** (megapixels) ≈ unlimited source resolution — DoS/memory risk, compounded by the unclamped width/height params.
- **Thumbnail fan-out:** `gridImages.ejs` thumbnails request back through this server, so opening a directory listing fires N proxy/resize requests at once.
- **Case sensitivity:** `validFiles` is lowercase-only; `IMG.JPG` is silently excluded by the extension checks.
- **Inspector exposure:** dev binds `--inspect=0.0.0.0:9229` (all interfaces).

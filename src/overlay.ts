import sharp from "sharp";
import { Overlay, OverlayPosition, Formats } from "./types";

const POSITIONS: readonly OverlayPosition[] = [
    "ce", "no", "so", "ea", "we", "noea", "nowe", "soea", "sowe",
];

const MAX_TEXT_LENGTH = 200;
const MAX_IMAGE_B64 = 64 * 1024;      // reject overlay_image base64 larger than ~64KB
const MAX_FONT_SIZE = 256;            // clamp overlay_size so the text SVG can't blow up memory
const MAX_OVERLAY_PIXELS = 25_000_000; // sharp decode/raster guard against pixel bombs

export const isValidPosition = (p: unknown): p is OverlayPosition =>
    typeof p === "string" && (POSITIONS as readonly string[]).includes(p);

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

const toInt = (v: unknown, def: number): number => {
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) ? n : def;
};

const toFloat = (v: unknown, def: number): number => {
    const n = parseFloat(String(v));
    return Number.isFinite(n) ? n : def;
};

const sanitizeHex = (v: unknown, def: string): string =>
    typeof v === "string" && /^[0-9a-fA-F]{6}$/.test(v) ? v : def;

const escapeXml = (s: string): string =>
    s.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

/** Parse overlay_* query params into an Overlay, or undefined when none are present. */
export const parseOverlayQuery = (query: { [k: string]: unknown }): Overlay | undefined => {
    const text =
        typeof query.overlay_text === "string" && query.overlay_text.length > 0
            ? query.overlay_text.slice(0, MAX_TEXT_LENGTH)
            : undefined;
    const image =
        typeof query.overlay_image === "string"
            && query.overlay_image.length > 0
            && query.overlay_image.length <= MAX_IMAGE_B64
            ? query.overlay_image
            : undefined;

    if (text === undefined && image === undefined) {
        return undefined;
    }

    const position = isValidPosition(query.overlay_position) ? query.overlay_position : "soea";
    const margin = Math.max(0, toInt(query.overlay_margin, 12));
    const opacity = clamp(toFloat(query.overlay_opacity, 1), 0, 1);

    // text takes precedence over image when both are supplied
    if (text !== undefined) {
        return {
            text,
            position,
            margin,
            opacity,
            size: clamp(toInt(query.overlay_size, 28), 1, MAX_FONT_SIZE),
            color: sanitizeHex(query.overlay_color, "FFFFFF"),
            bg: query.overlay_bg === "none" ? "none" : sanitizeHex(query.overlay_bg, "000000"),
        };
    }

    return {
        image,
        position,
        margin,
        opacity,
        scale: query.overlay_scale !== undefined ? clamp(toFloat(query.overlay_scale, 1), 0, 1) : undefined,
    };
};

/** Build a transparent SVG (string) with the text, optionally on a rounded box. */
export const buildTextSvg = (text: string, size: number, color: string, bg: string): string => {
    const padding = Math.round(size * 0.4);
    const charWidth = size * 0.62; // rough estimate; fine for short labels
    const textWidth = Math.ceil(text.length * charWidth);
    const width = textWidth + padding * 2;
    const height = Math.ceil(size * 1.3) + padding * 2;
    const safe = escapeXml(text);
    const hasBox = bg !== "none";
    const box = hasBox
        ? `<rect width="${width}" height="${height}" rx="${padding}" ry="${padding}" fill="#${bg}" fill-opacity="0.55"/>`
        : "";
    // without a box, give the text a stroke so it stays legible over any background
    const stroke = hasBox
        ? ""
        : ` stroke="#000000" stroke-opacity="0.6" stroke-width="${Math.max(1, Math.round(size / 12))}" paint-order="stroke"`;
    // dy=0.35em vertically centres the text without relying on dominant-baseline,
    // which librsvg (sharp's SVG renderer) does not honour reliably.
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${box}<text x="${width / 2}" y="${height / 2}" dy="0.35em" font-family="sans-serif" font-size="${size}" fill="#${color}" text-anchor="middle"${stroke}>${safe}</text></svg>`;
};

/** Compute the top/left placement of an overlay of size ovW x ovH within a baseW x baseH image. */
export const computePlacement = (
    position: OverlayPosition,
    margin: number,
    baseW: number,
    baseH: number,
    ovW: number,
    ovH: number,
): { top: number; left: number } => {
    const top = position.includes("no")
        ? margin
        : position.includes("so")
            ? baseH - ovH - margin
            : Math.round((baseH - ovH) / 2);
    const left = position.includes("ea")
        ? baseW - ovW - margin
        : position.includes("we")
            ? margin
            : Math.round((baseW - ovW) / 2);
    return { top: Math.max(0, top), left: Math.max(0, left) };
};

/** Multiply an image's alpha channel by `opacity` (0..1) using a dest-in composite. */
const applyOpacity = async (buffer: Buffer, opacity: number): Promise<Buffer> => {
    const meta = await sharp(buffer).metadata();
    if (meta.width == null || meta.height == null) {
        return buffer; // fail safe: leave the overlay untouched rather than mis-masking
    }
    return sharp(buffer)
        .ensureAlpha()
        .composite([
            {
                input: { create: { width: meta.width, height: meta.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: opacity } } },
                blend: "dest-in",
            },
        ])
        .png()
        .toBuffer();
};

/** Render the overlay (text->SVG or decoded base64 image) to a PNG buffer + its pixel size. */
const buildOverlayBuffer = async (
    overlay: Overlay,
    baseW: number,
): Promise<{ buffer: Buffer; width: number; height: number }> => {
    let pipeline: sharp.Sharp;
    if (overlay.text !== undefined) {
        const svg = buildTextSvg(overlay.text, overlay.size ?? 28, overlay.color ?? "FFFFFF", overlay.bg ?? "000000");
        pipeline = sharp(Buffer.from(svg), { limitInputPixels: MAX_OVERLAY_PIXELS });
    } else {
        pipeline = sharp(Buffer.from(overlay.image ?? "", "base64"), { limitInputPixels: MAX_OVERLAY_PIXELS });
        if (overlay.scale !== undefined && overlay.scale > 0 && overlay.scale <= 1) {
            pipeline = pipeline.resize({ width: Math.max(1, Math.round(baseW * overlay.scale)) });
        }
    }
    let buffer = await pipeline.png().toBuffer();
    if (overlay.opacity < 1) {
        buffer = await applyOpacity(buffer, overlay.opacity);
    }
    const meta = await sharp(buffer).metadata();
    return { buffer, width: meta.width ?? 0, height: meta.height ?? 0 };
};

/** Encode the composited image to the requested format/quality (sharp can't write bmp/ico -> png). */
const encode = (img: sharp.Sharp, format?: Formats, quality?: number): Promise<Buffer> => {
    const opts = quality !== undefined ? { quality } : {};
    switch (format) {
        case Formats.jpg: return img.jpeg(opts).toBuffer();
        case Formats.webp: return img.webp(opts).toBuffer();
        case Formats.avif: return img.avif(opts).toBuffer();
        case Formats.gif: return img.gif().toBuffer();
        case Formats.tiff: return img.tiff(opts).toBuffer();
        case Formats.png: return img.png().toBuffer();
        default: return img.png().toBuffer(); // bmp / ico / pdf / unknown
    }
};

/** Composite the overlay onto the (already resized) base image, re-encoding to format/quality. */
export const applyOverlay = async (
    baseImage: Buffer,
    overlay: Overlay,
    format?: Formats,
    quality?: number,
): Promise<Buffer> => {
    const base = sharp(baseImage);
    const meta = await base.metadata();
    const baseW = meta.width ?? 0;
    const baseH = meta.height ?? 0;

    let { buffer, width, height } = await buildOverlayBuffer(overlay, baseW);

    // sharp refuses to composite an input larger than the base — shrink it to fit
    if (width > baseW || height > baseH) {
        buffer = await sharp(buffer)
            .resize({ width: Math.min(width, baseW), height: Math.min(height, baseH), fit: "inside" })
            .png()
            .toBuffer();
        const m = await sharp(buffer).metadata();
        width = m.width ?? width;
        height = m.height ?? height;
    }

    const { top, left } = computePlacement(overlay.position, overlay.margin, baseW, baseH, width, height);
    return encode(base.composite([{ input: buffer, top, left }]), format, quality);
};

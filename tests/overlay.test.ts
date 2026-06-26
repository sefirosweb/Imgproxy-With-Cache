import sharp from "sharp";
import {
    parseOverlayQuery,
    buildTextSvg,
    computePlacement,
    isValidPosition,
    applyOverlay,
} from "../src/overlay";
import { Formats, Overlay } from "../src/types";

const makeImage = (w: number, h: number) =>
    sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toBuffer();

describe("parseOverlayQuery", () => {
    it("returns undefined when no overlay params are present", () => {
        expect(parseOverlayQuery({ width: "300" })).toBeUndefined();
    });

    it("parses a text overlay with defaults", () => {
        expect(parseOverlayQuery({ overlay_text: "1/4" })).toEqual({
            text: "1/4", position: "soea", margin: 12, opacity: 1, size: 28, color: "FFFFFF", bg: "000000",
        });
    });

    it("parses custom text style/placement", () => {
        expect(parseOverlayQuery({
            overlay_text: "hi", overlay_position: "nowe", overlay_margin: "20",
            overlay_opacity: "0.5", overlay_size: "40", overlay_color: "ff0000", overlay_bg: "none",
        })).toEqual({ text: "hi", position: "nowe", margin: 20, opacity: 0.5, size: 40, color: "ff0000", bg: "none" });
    });

    it("falls back to defaults for invalid position/color and clamps opacity", () => {
        const o = parseOverlayQuery({ overlay_text: "x", overlay_position: "xx", overlay_color: "zzz", overlay_opacity: "5" })!;
        expect(o.position).toBe("soea");
        expect(o.color).toBe("FFFFFF");
        expect(o.opacity).toBe(1);
    });

    it("parses an image overlay (no text) with scale", () => {
        expect(parseOverlayQuery({ overlay_image: "QUJD", overlay_scale: "0.3" })).toEqual({
            image: "QUJD", position: "soea", margin: 12, opacity: 1, scale: 0.3,
        });
    });

    it("lets text take precedence over image when both are given", () => {
        const o = parseOverlayQuery({ overlay_text: "T", overlay_image: "QUJD" })!;
        expect(o.text).toBe("T");
        expect(o.image).toBeUndefined();
    });

    it("truncates very long text", () => {
        expect(parseOverlayQuery({ overlay_text: "a".repeat(500) })!.text!.length).toBe(200);
    });

    it("clamps overlay_size to a safe maximum", () => {
        expect(parseOverlayQuery({ overlay_text: "x", overlay_size: "1000000" })!.size).toBe(256);
    });

    it("ignores an oversized base64 image", () => {
        expect(parseOverlayQuery({ overlay_image: "A".repeat(70000) })).toBeUndefined();
    });
});

describe("isValidPosition", () => {
    it("accepts valid codes and rejects everything else", () => {
        expect(isValidPosition("soea")).toBe(true);
        expect(isValidPosition("ce")).toBe(true);
        expect(isValidPosition("xx")).toBe(false);
        expect(isValidPosition(5)).toBe(false);
    });
});

describe("buildTextSvg", () => {
    it("escapes XML-significant characters", () => {
        const svg = buildTextSvg("a&b<c>\"'", 28, "FFFFFF", "000000");
        expect(svg).toContain("a&amp;b&lt;c&gt;&quot;&apos;");
        expect(svg).not.toContain("<c>");
    });

    it("includes a box when bg != none and omits it for 'none'", () => {
        expect(buildTextSvg("x", 28, "FFFFFF", "000000")).toContain("<rect");
        expect(buildTextSvg("x", 28, "FFFFFF", "none")).not.toContain("<rect");
    });

    it("produces an SVG that sharp can rasterize", async () => {
        const png = await sharp(Buffer.from(buildTextSvg("1/4", 28, "FFFFFF", "000000"))).png().toBuffer();
        expect(png.length).toBeGreaterThan(0);
    });
});

describe("computePlacement", () => {
    it("places soea at bottom-right with margin", () => {
        expect(computePlacement("soea", 10, 200, 100, 40, 20)).toEqual({ top: 70, left: 150 });
    });
    it("places nowe at top-left with margin", () => {
        expect(computePlacement("nowe", 10, 200, 100, 40, 20)).toEqual({ top: 10, left: 10 });
    });
    it("centers 'ce'", () => {
        expect(computePlacement("ce", 10, 200, 100, 40, 20)).toEqual({ top: 40, left: 80 });
    });
    it("clamps negative offsets to 0", () => {
        expect(computePlacement("soea", 999, 200, 100, 40, 20)).toEqual({ top: 0, left: 0 });
    });
});

describe("applyOverlay (real sharp)", () => {
    it("composites a text overlay and preserves base dimensions", async () => {
        const base = await makeImage(300, 180);
        const overlay: Overlay = { text: "1/4", position: "soea", margin: 12, opacity: 1, size: 28, color: "FFFFFF", bg: "000000" };
        const meta = await sharp(await applyOverlay(base, overlay)).metadata();
        expect(meta.width).toBe(300);
        expect(meta.height).toBe(180);
    });

    it("composites a base64 image overlay with opacity and scale", async () => {
        const base = await makeImage(300, 180);
        const logo = (await makeImage(60, 60)).toString("base64");
        const overlay: Overlay = { image: logo, position: "noea", margin: 8, opacity: 0.5, scale: 0.2 };
        const meta = await sharp(await applyOverlay(base, overlay)).metadata();
        expect(meta.width).toBe(300);
        expect(meta.height).toBe(180);
    });

    it("shrinks an oversized overlay to fit instead of throwing", async () => {
        const base = await makeImage(40, 20);
        const overlay: Overlay = { text: "VERY LONG LABEL", position: "ce", margin: 0, opacity: 1, size: 28, color: "FFFFFF", bg: "000000" };
        await expect(applyOverlay(base, overlay)).resolves.toBeInstanceOf(Buffer);
    });

    it("re-encodes to the requested format/quality", async () => {
        const base = await makeImage(300, 180);
        const overlay: Overlay = { text: "x", position: "ce", margin: 0, opacity: 1, size: 28, color: "FFFFFF", bg: "000000" };
        const out = await applyOverlay(base, overlay, Formats.webp, 60);
        expect((await sharp(out).metadata()).format).toBe("webp");
    });

    it("rejects an invalid (non-image) base64 overlay", async () => {
        const base = await makeImage(300, 180);
        const notImage = Buffer.from("definitely not an image, just text").toString("base64");
        await expect(
            applyOverlay(base, { image: notImage, position: "soea", margin: 12, opacity: 1, scale: 0.5 }),
        ).rejects.toThrow();
    });
});

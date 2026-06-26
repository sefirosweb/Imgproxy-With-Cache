jest.mock("dotenv", () => ({ config: jest.fn() }));
jest.mock("../src/config", () => ({ useS3: false }));
jest.mock("../src/compress");
jest.mock("../src/s3", () => ({ downloadS3File: jest.fn() }));
jest.mock("../src/overlay", () => ({ parseOverlayQuery: jest.fn() }));
jest.mock("fs");

import { existsSync } from "fs";
import compress from "../src/compress";
import { parseOverlayQuery } from "../src/overlay";
import validateFile from "../src/validateFile";

const mockExistsSync = existsSync as unknown as jest.Mock;
const mockCompress = compress as unknown as jest.Mock;
const mockParseOverlay = parseOverlayQuery as jest.Mock;

const makeRes = () => {
    const res: Record<string, jest.Mock> = {};
    res.status = jest.fn(() => res);
    res.send = jest.fn(() => res);
    res.sendFile = jest.fn(() => res);
    return res;
};

// media exists, cache file does not -> forces the compress path
const cacheMiss = () => mockExistsSync.mockImplementation((p: unknown) => !String(p).includes("cache"));

const run = (reqPath: string, query: Record<string, string>, mediaPath = "/srv/media/a.jpg") => {
    const res = makeRes();
    return { res, done: validateFile(reqPath, query, res as never, mediaPath) };
};

describe("validateFile guards", () => {
    it("404s favicon.ico without compressing", async () => {
        const { res, done } = run("/favicon.ico", {});
        await done;
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.send).toHaveBeenCalled();
        expect(mockCompress).not.toHaveBeenCalled();
    });

    it("404s a missing local file", async () => {
        mockExistsSync.mockReturnValue(false);
        const { res, done } = run("/a.jpg", { width: "100" });
        await done;
        expect(res.status).toHaveBeenCalledWith(404);
        expect(mockCompress).not.toHaveBeenCalled();
    });

    it("serves the original file when there are no query params", async () => {
        mockExistsSync.mockReturnValue(true);
        const { res, done } = run("/a.jpg", {});
        await done;
        expect(res.sendFile).toHaveBeenCalledWith("/srv/media/a.jpg");
        expect(mockCompress).not.toHaveBeenCalled();
    });

    it("serves the PDF placeholder for a .pdf request with params", async () => {
        mockExistsSync.mockReturnValue(true);
        const { res, done } = run("/doc.pdf", { width: "100" }, "/srv/media/doc.pdf");
        await done;
        expect(res.sendFile).toHaveBeenCalledWith(expect.stringContaining("pdf-file.png"));
        expect(mockCompress).not.toHaveBeenCalled();
    });
});

describe("validateFile cache + compression", () => {
    it("serves a cache hit without calling compress", async () => {
        mockExistsSync.mockReturnValue(true); // both media and cache exist
        const { res, done } = run("/a.jpg", { width: "300" });
        await done;
        expect(res.sendFile).toHaveBeenCalledWith(expect.stringContaining("cache"));
        expect(mockCompress).not.toHaveBeenCalled();
    });

    it("compresses on a cache miss and serves the result", async () => {
        cacheMiss();
        mockCompress.mockResolvedValue("/out/cache/result.jpg");
        const { res, done } = run("/a.jpg", { width: "300" });
        await done;
        expect(mockCompress).toHaveBeenCalledTimes(1);
        expect(res.sendFile).toHaveBeenCalledWith("/out/cache/result.jpg");
    });

    it("serves the error placeholder when compress throws", async () => {
        cacheMiss();
        mockCompress.mockRejectedValue(new Error("imgproxy down"));
        const { res, done } = run("/a.jpg", { width: "300" });
        await done;
        expect(res.sendFile).toHaveBeenCalledWith(expect.stringContaining("error-file.png"));
    });
});

describe("validateFile query -> EncodeOptions + cache key", () => {
    it("maps all query params into the encoding passed to compress", async () => {
        cacheMiss();
        mockCompress.mockResolvedValue("/out/cache/x.webp");
        const query = {
            format: "webp",
            width: "300",
            height: "200",
            enlarge: "1",
            extend: "1",
            resizing_type: "fill",
            background_rgb: "FF0000",
            quality: "50",
        };
        const { done } = run("/a.jpg", query);
        await done;

        const [encoding, md5] = mockCompress.mock.calls[0];
        expect(encoding).toEqual({
            path: "/a.jpg",
            format: "webp",
            resize: { resizing_type: "fill", width: 300, height: 200, enlarge: "1", extend: "1" },
            background: { red: "255", green: "0", blue: "0" },
            quality: 50,
        });
        expect(md5).toMatch(/^[a-f0-9]{32}\.webp$/);
    });

    it("produces a deterministic cache key for identical inputs", async () => {
        cacheMiss();
        mockCompress.mockResolvedValue("/out/cache/x.jpg");
        await run("/a.jpg", { width: "300" }).done;
        await run("/a.jpg", { width: "300" }).done;
        expect(mockCompress.mock.calls[0][1]).toBe(mockCompress.mock.calls[1][1]);
    });
});

describe("validateFile overlay", () => {
    const overlay = { text: "1/4", position: "soea", margin: 12, opacity: 1, size: 28, color: "FFFFFF", bg: "000000" };

    it("attaches a parsed overlay to the encoding and changes the cache key", async () => {
        mockParseOverlay.mockReturnValue(overlay);
        cacheMiss();
        mockCompress.mockResolvedValue("/out/cache/x.jpg");
        await run("/a.jpg", { width: "300", overlay_text: "1/4" }).done;

        const [encoding, keyWith] = mockCompress.mock.calls[0];
        expect(encoding.overlay).toEqual(overlay);

        // a different overlay must yield a different cache key
        mockCompress.mockClear();
        mockParseOverlay.mockReturnValue({ ...overlay, text: "2/4" });
        cacheMiss();
        await run("/a.jpg", { width: "300", overlay_text: "2/4" }).done;
        expect(mockCompress.mock.calls[0][1]).not.toBe(keyWith);
    });
});

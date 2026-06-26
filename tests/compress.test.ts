jest.mock("../src/config", () => ({ useS3: false, awsBucketName: "my-bucket" }));
jest.mock("node-fetch", () => jest.fn());
jest.mock("fs", () => {
    const { PassThrough } = require("stream");
    return { createWriteStream: jest.fn(() => new PassThrough()) };
});
jest.mock("fs/promises", () => ({ writeFile: jest.fn() }));
jest.mock("../src/overlay", () => ({ applyOverlay: jest.fn() }));

import fetch from "node-fetch";
import { writeFile } from "fs/promises";
import { Readable } from "stream";
import compress from "../src/compress";
import { applyOverlay } from "../src/overlay";
import { Formats, ResizingType, EncodeOptions } from "../src/types";

// the SAME mutable mock object the source module reads from
const config = jest.requireMock("../src/config") as { useS3: boolean };
const mockedFetch = fetch as unknown as jest.Mock;
const okResponse = () => ({
    ok: true,
    statusText: "OK",
    body: Readable.from([Buffer.from("imgdata")]),
    arrayBuffer: async () => Buffer.from("imgdata"),
});
const urlOf = () => mockedFetch.mock.calls[0][0] as string;

beforeEach(() => {
    config.useS3 = false;
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue(okResponse());
});

const baseLocal = (resize?: EncodeOptions["resize"], extra: Partial<EncodeOptions> = {}): EncodeOptions => ({
    path: "/a.jpg",
    format: Formats.jpg,
    resize,
    ...extra,
});

describe("compress URL building", () => {
    it("builds a local imgproxy URL with full positional resize params", async () => {
        await compress(baseLocal({ resizing_type: ResizingType.fit, width: 300 }), "hash.jpg");
        expect(urlOf()).toBe(
            "http://imgproxy:8080/insecure/resize:fit:300:0:0:0/plain/local:///a.jpg@jpg"
        );
    });

    it("REGRESSION: applies enlarge/extend even without a height", async () => {
        await compress(
            baseLocal({ resizing_type: ResizingType.fit, width: 300, enlarge: "1", extend: "1" }),
            "hash.jpg"
        );
        expect(urlOf()).toContain("resize:fit:300:0:1:1/");
    });

    it("includes height when provided", async () => {
        await compress(
            baseLocal({ resizing_type: ResizingType.fill, width: 300, height: 200, enlarge: "1", extend: "0" }),
            "hash.jpg"
        );
        expect(urlOf()).toContain("resize:fill:300:200:1:0/");
    });

    it("appends background and quality segments", async () => {
        await compress(
            baseLocal({ resizing_type: ResizingType.fit, width: 100 }, {
                background: { red: "255", green: "0", blue: "128" },
                quality: 75,
            }),
            "hash.jpg"
        );
        const url = urlOf();
        expect(url).toContain("bg:255:0:128/");
        expect(url).toContain("quality:75/");
    });

    it("builds an s3:// source URL in S3 mode (key normalized)", async () => {
        config.useS3 = true;
        await compress({ path: "//folder//a.jpg", format: Formats.webp }, "hash.webp");
        expect(urlOf()).toBe(
            "http://imgproxy:8080/insecure/plain/s3://my-bucket/folder/a.jpg@webp"
        );
    });

    it("returns the cache path on success", async () => {
        const result = await compress(baseLocal(), "deadbeef.jpg");
        expect(result.endsWith(`${require("path").sep}cache${require("path").sep}deadbeef.jpg`)).toBe(true);
    });

    it("throws when imgproxy responds with a non-ok status", async () => {
        mockedFetch.mockReset();
        mockedFetch.mockResolvedValue({ ok: false, statusText: "Not Found" });
        await expect(compress(baseLocal(), "hash.jpg")).rejects.toThrow("Unexpected response Not Found");
    });

    it("runs the sharp overlay step and writes the composited result when an overlay is present", async () => {
        (applyOverlay as jest.Mock).mockResolvedValue(Buffer.from("composited"));
        await compress(
            baseLocal({ resizing_type: ResizingType.fit, width: 300 }, {
                overlay: { text: "1/4", position: "soea", margin: 12, opacity: 1, size: 28, color: "FFFFFF", bg: "000000" },
            }),
            "withoverlay.jpg"
        );
        expect(mockedFetch).toHaveBeenCalledTimes(1); // imgproxy is still used for the resize
        expect(applyOverlay).toHaveBeenCalledTimes(1);
        const writeCall = (writeFile as jest.Mock).mock.calls[0];
        expect(writeCall[0]).toContain("withoverlay.jpg");
        expect(writeCall[1]).toEqual(Buffer.from("composited"));
    });
});

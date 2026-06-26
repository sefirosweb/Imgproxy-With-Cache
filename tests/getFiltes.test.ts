jest.mock("../src/config", () => ({ useS3: false, awsRegion: "us-east-1", awsBucketName: "bucket" }));
jest.mock("../src/s3", () => ({ listBucketObjects: jest.fn() }));

import fs from "fs";
import os from "os";
import path from "path";
import { listBucketObjects } from "../src/s3";
import { validFiles, getDataFromFolder, exisPath } from "../src/getFiltes";

// the SAME mutable mock object the source module reads from
const config = jest.requireMock("../src/config") as { useS3: boolean };
const setUseS3 = (v: boolean) => {
    config.useS3 = v;
};

let tmpDir: string;
let picFile: string;

beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "imgcache-test-"));
    fs.mkdirSync(path.join(tmpDir, "folderA"));
    fs.mkdirSync(path.join(tmpDir, ".hiddenFolder"));
    picFile = path.join(tmpDir, "pic.jpg");
    fs.writeFileSync(picFile, Buffer.alloc(200 * 1024)); // 200 KiB -> 0.19 MB
    fs.writeFileSync(path.join(tmpDir, "doc.txt"), "not an image");
    fs.writeFileSync(path.join(tmpDir, ".hidden.png"), "hidden");
});

afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => setUseS3(false));

describe("validFiles", () => {
    it("is the dotted list of Formats enum values", () => {
        expect(validFiles).toEqual([".png", ".jpg", ".webp", ".avif", ".gif", ".ico", ".bmp", ".tiff", ".pdf"]);
    });
    it("includes .pdf and excludes .txt", () => {
        expect(validFiles).toContain(".pdf");
        expect(validFiles).not.toContain(".txt");
    });
});

describe("getDataFromFolder (local)", () => {
    it("lists non-hidden folders and image files only, with clean shape", async () => {
        const { folders, files } = await getDataFromFolder(tmpDir, "/");

        expect(folders).toEqual(["folderA"]); // .hiddenFolder excluded
        expect(files).toHaveLength(1); // doc.txt and .hidden.png excluded
        expect(files[0]).toEqual({ name: "pic.jpg", fileSize: 0.19 });
        // clean shape: no leaked fs.Dirent fields
        expect(Object.keys(files[0]).sort()).toEqual(["fileSize", "name"]);
    });
});

describe("getDataFromFolder (S3 dispatch)", () => {
    it("delegates to listBucketObjects when useS3 is true", async () => {
        setUseS3(true);
        const s3Result = { folders: ["s3folder"], files: [{ name: "x.jpg", fileSize: 1 }] };
        (listBucketObjects as jest.Mock).mockResolvedValue(s3Result);

        const result = await getDataFromFolder("/ignored/local/path", "/some/prefix");

        expect(listBucketObjects).toHaveBeenCalledWith("/some/prefix");
        expect(result).toBe(s3Result);
    });
});

describe("exisPath", () => {
    it("returns true for an existing directory", () => {
        expect(exisPath(tmpDir)).toBe(true);
    });
    it("returns false for a file (not a directory)", () => {
        expect(exisPath(picFile)).toBe(false);
    });
    it("returns false for a missing path", () => {
        expect(exisPath(path.join(tmpDir, "does-not-exist"))).toBe(false);
    });
    it("always returns true in S3 mode", () => {
        setUseS3(true);
        expect(exisPath("/anything")).toBe(true);
    });
});

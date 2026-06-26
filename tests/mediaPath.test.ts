import path from "path";
import { resolveMediaPath, mediaRoot } from "../src/mediaPath";

describe("resolveMediaPath (path-traversal guard)", () => {
    it("allows the media root itself", () => {
        expect(resolveMediaPath("/")).toBe(mediaRoot);
    });

    it("allows a normal file", () => {
        expect(resolveMediaPath("/photos/cat.jpg")).toBe(path.join(mediaRoot, "photos", "cat.jpg"));
    });

    it("allows a deeply nested path", () => {
        expect(resolveMediaPath("/a/b/c/deep.png")).toBe(path.join(mediaRoot, "a", "b", "c", "deep.png"));
    });

    it("collapses harmless inner '..' that stays inside the root", () => {
        expect(resolveMediaPath("/photos/../images/x.jpg")).toBe(path.join(mediaRoot, "images", "x.jpg"));
    });

    it.each([
        "/../../etc/passwd",
        "/../../../etc/shadow",
        "/photos/../../secret.jpg",
        "/..",
        "/../",
    ])("blocks traversal payload %s", (payload) => {
        expect(resolveMediaPath(payload)).toBeNull();
    });

    it("blocks the sibling-prefix trick (/../media-secret)", () => {
        // must not be accepted just because it starts with the mediaRoot string
        expect(resolveMediaPath("/../media-secret/x.jpg")).toBeNull();
    });
});

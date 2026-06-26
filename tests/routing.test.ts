jest.mock("../src/config", () => ({ useS3: false, appUrl: "http://localhost:8080", port: 8080 }));
jest.mock("../src/validateFile");
jest.mock("../src/mediaPath", () => ({ resolveMediaPath: jest.fn(), mediaRoot: "/media" }));
jest.mock("../src/getFiltes", () => ({
    validFiles: [".jpg", ".png", ".pdf"],
    exisPath: jest.fn(),
    getDataFromFolder: jest.fn(),
}));

import request from "supertest";
import validateFile from "../src/validateFile";
import { resolveMediaPath } from "../src/mediaPath";
import { exisPath, getDataFromFolder } from "../src/getFiltes";
import { app } from "../src/index";

const mockResolve = resolveMediaPath as jest.Mock;
const mockValidate = validateFile as unknown as jest.Mock;
const mockExisPath = exisPath as jest.Mock;
const mockGetData = getDataFromFolder as jest.Mock;

describe("GET /* routing", () => {
    it("404s when the resolved path escapes the media root", async () => {
        mockResolve.mockReturnValue(null);
        const res = await request(app).get("/whatever.jpg");
        expect(res.status).toBe(404);
        expect(mockValidate).not.toHaveBeenCalled();
    });

    it("dispatches image-extension requests to validateFile", async () => {
        mockResolve.mockReturnValue("/media/a.jpg");
        mockValidate.mockImplementation((_reqPath, _query, res) => res.status(200).send("handled"));
        const res = await request(app).get("/a.jpg");
        expect(res.status).toBe(200);
        expect(res.text).toBe("handled");
        expect(mockValidate).toHaveBeenCalledTimes(1);
        expect(mockValidate.mock.calls[0][0]).toBe("/a.jpg");
    });

    it("renders a directory listing for a folder request", async () => {
        mockResolve.mockReturnValue("/media/sub");
        mockExisPath.mockReturnValue(true);
        mockGetData.mockResolvedValue({ folders: ["nested-folder"], files: [] });
        const res = await request(app).get("/sub");
        expect(res.status).toBe(200);
        expect(res.text).toContain("Media Server");
        expect(res.text).toContain("nested-folder");
        expect(mockValidate).not.toHaveBeenCalled();
    });

    it("404s a non-existent folder", async () => {
        mockResolve.mockReturnValue("/media/missing");
        mockExisPath.mockReturnValue(false);
        const res = await request(app).get("/missing");
        expect(res.status).toBe(404);
    });
});

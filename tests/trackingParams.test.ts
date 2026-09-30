// Parámetros que Google Ads / Analytics añaden a los enlaces (auto-tagging + cross-domain linker).
// Reproduce el enlace real que rompe la descarga de la guía de medidas:
// https://media.decowood.com/web/pdf/measurement_guide_es.pdf?_gl=...&gclid=...&gbraid=...
//
// Se ejecuta la app real (routing + validateFile + fs de verdad); solo se redirige el media root
// a tests/fixtures/media y se mockean imgproxy (compress) y S3.
jest.mock("dotenv", () => ({ config: jest.fn() }));
jest.mock("../src/config", () => ({ useS3: false, appUrl: "http://localhost:8080", port: 8080 }));
jest.mock("../src/compress");
jest.mock("../src/s3", () => ({ downloadS3File: jest.fn(), listBucketObjects: jest.fn() }));
jest.mock("../src/mediaPath", () => {
    const path = jest.requireActual("path");
    const mediaRoot = path.join(__dirname, "fixtures", "media");
    return { mediaRoot, resolveMediaPath: (reqPath: string) => path.join(mediaRoot, reqPath) };
});

import { readFileSync } from "fs";
import path from "path";
import request from "supertest";
import compress from "../src/compress";
import { app } from "../src/index";

const mockCompress = compress as unknown as jest.Mock;

const fixture = (reqPath: string) => readFileSync(path.join(__dirname, "fixtures", "media", reqPath));

// Query string tal cual la genera la web / Google Analytics
const TRACKING_QUERY =
    "_gl=1*1bmgs18*_up*MQ.." +
    "&gclid=CjwKCAjwr8LHBhBKEiwAy47uUjLQQjuVYh9lf6zvtyISz8tTn2G1Md28ne5ziJA0xe0w48LnXjknGRoC_WAQAvD_BwE" +
    "&gbraid=0AAAAADBgH8nouM7rsIKhJaEiQEQYng1dS";

// supertest no bufferiza application/pdf ni image/*: recogemos el cuerpo como Buffer
const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () => cb(null, Buffer.concat(chunks)));
};

const get = (url: string) => request(app).get(url).buffer(true).parse(binary);

describe("parámetros de tracking en la URL (gclid, _gl, gbraid)", () => {
    const pdfPath = "/web/pdf/measurement_guide_es.pdf";
    const imgPath = "/web/img/logo.png";

    beforeEach(() => {
        mockCompress.mockRejectedValue(new Error("imgproxy no debería llamarse"));
    });

    it("control: el PDF sin parámetros se descarga tal cual", async () => {
        const res = await get(pdfPath);
        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toMatch(/^application\/pdf/);
        expect(res.body).toEqual(fixture(pdfPath));
    });

    it("REGRESSION: el PDF con parámetros de tracking se descarga tal cual (no el placeholder pdf-file.png)", async () => {
        const res = await get(`${pdfPath}?${TRACKING_QUERY}`);
        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toMatch(/^application\/pdf/);
        expect(res.body).toEqual(fixture(pdfPath));
    });

    it("REGRESSION: una imagen con solo parámetros de tracking se sirve original, sin pasar por imgproxy", async () => {
        const res = await get(`${imgPath}?${TRACKING_QUERY}`);
        expect(mockCompress).not.toHaveBeenCalled();
        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toMatch(/^image\/png/);
        expect(res.body).toEqual(fixture(imgPath));
    });
});

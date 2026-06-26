jest.mock("dotenv", () => ({ config: jest.fn() }));

describe("config", () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...ORIGINAL_ENV };
        delete process.env.APP_PORT;
        delete process.env.APP_URL;
        delete process.env.USE_AWS_S3;
        delete process.env.AWS_REGION;
        delete process.env.AWS_BUCKET_NAME;
        delete process.env.AWS_ACCESS_KEY_ID;
        delete process.env.AWS_SECRET_ACCESS_KEY;
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    it("applies defaults when env is unset", () => {
        jest.isolateModules(() => {
            const config = require("../src/config");
            expect(config.useS3).toBe(false);
            expect(config.port).toBe(8080);
            expect(config.appUrl).toBe("http://localhost:8080");
        });
    });

    it("reads APP_PORT and APP_URL from the environment", () => {
        process.env.APP_PORT = "9000";
        process.env.APP_URL = "http://example.com";
        jest.isolateModules(() => {
            const config = require("../src/config");
            expect(config.port).toBe("9000"); // raw string from env, not parsed
            expect(config.appUrl).toBe("http://example.com");
        });
    });

    it("throws at load when USE_AWS_S3=true but AWS_REGION is missing", () => {
        process.env.USE_AWS_S3 = "true";
        expect(() => jest.isolateModules(() => require("../src/config"))).toThrow("MISSING AWS_REGION");
    });

    it("loads cleanly with a complete S3 configuration", () => {
        process.env.USE_AWS_S3 = "true";
        process.env.AWS_REGION = "us-east-1";
        process.env.AWS_BUCKET_NAME = "bucket";
        process.env.AWS_ACCESS_KEY_ID = "key";
        process.env.AWS_SECRET_ACCESS_KEY = "secret";
        jest.isolateModules(() => {
            const config = require("../src/config");
            expect(config.useS3).toBe(true);
            expect(config.awsRegion).toBe("us-east-1");
            expect(config.awsBucketName).toBe("bucket");
        });
    });
});

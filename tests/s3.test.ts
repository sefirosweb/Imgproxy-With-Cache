jest.mock("../src/config", () => ({ awsRegion: "us-east-1", awsBucketName: "test-bucket" }));

import { S3Client, GetObjectCommand, ListObjectsCommand } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { downloadS3File, listBucketObjects } from "../src/s3";

const s3Mock = mockClient(S3Client);

beforeEach(() => s3Mock.reset());

describe("downloadS3File", () => {
    it("normalizes the key (collapses // and strips leading /) and returns the response", async () => {
        s3Mock.on(GetObjectCommand).resolves({ Body: "BODY" } as never);

        const res = await downloadS3File("//a//b.jpg");

        expect(res).toEqual({ Body: "BODY" });
        const call = s3Mock.commandCalls(GetObjectCommand)[0];
        expect(call.args[0].input).toMatchObject({ Bucket: "test-bucket", Key: "a/b.jpg" });
    });

    it("returns null when the S3 call fails", async () => {
        s3Mock.on(GetObjectCommand).rejects(new Error("nope"));
        await expect(downloadS3File("/missing.jpg")).resolves.toBeNull();
    });
});

describe("listBucketObjects", () => {
    it("maps CommonPrefixes to folders and filters Contents by image extension", async () => {
        s3Mock.on(ListObjectsCommand).resolves({
            Contents: [
                { Key: "folder/a.jpg", Size: 200 * 1024 },
                { Key: "folder/notes.txt", Size: 10 },
            ],
            CommonPrefixes: [{ Prefix: "folder/sub/" }],
            IsTruncated: false,
        } as never);

        const { folders, files } = await listBucketObjects("/folder");

        expect(folders).toEqual(["sub"]);
        expect(files).toEqual([{ name: "a.jpg", fileSize: 0.19 }]);

        const input = s3Mock.commandCalls(ListObjectsCommand)[0].args[0].input;
        expect(input).toMatchObject({ Bucket: "test-bucket", Prefix: "folder/", Delimiter: "/" });
    });

    it("follows pagination via IsTruncated / NextMarker", async () => {
        s3Mock
            .on(ListObjectsCommand)
            .resolvesOnce({
                Contents: [{ Key: "p1.jpg", Size: 1 }],
                IsTruncated: true,
                NextMarker: "mark-2",
            } as never)
            .resolvesOnce({
                Contents: [{ Key: "p2.png", Size: 1 }],
                IsTruncated: false,
            } as never);

        const { files } = await listBucketObjects("");

        expect(files.map((f) => f.name)).toEqual(["p1.jpg", "p2.png"]);
        const calls = s3Mock.commandCalls(ListObjectsCommand);
        expect(calls).toHaveLength(2);
        expect(calls[0].args[0].input.Marker).toBeUndefined();
        expect(calls[1].args[0].input.Marker).toBe("mark-2");
    });

    it("uses an empty prefix for the bucket root", async () => {
        s3Mock.on(ListObjectsCommand).resolves({ Contents: [], CommonPrefixes: [], IsTruncated: false } as never);
        await listBucketObjects("/");
        expect(s3Mock.commandCalls(ListObjectsCommand)[0].args[0].input.Prefix).toBe("");
    });
});

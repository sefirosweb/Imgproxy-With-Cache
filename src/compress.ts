import path from "path";
import { createWriteStream } from 'fs';
// @ts-ignore
import { EncodeOptions } from "./types";
import { promisify } from "util";
import { pipeline } from "stream";
import fetch from "node-fetch";


export default (encodeOptions: EncodeOptions, md5: string): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        // const filePath = path.join(__dirname, '..', 'media', encodeOptions.path);
        const cachePath = path.join(__dirname, '..', 'cache', md5 + '.jpg');

        try {
            console.log(`Compresion start: ${encodeOptions.path}`)
            // const url = `imgproxy:8080/insecure/plain/local://${encodeOptions.path}`
            // const url = `http://imgproxy:8080/insecure/rs:fit:300/plain/local:///photo.jpg`
            const url = `http://imgproxy:8080/insecure/rs:fit:300/plain/local://${encodeOptions.path}`
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

            console.log({ url })
            const streamPipeline = promisify(pipeline);
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Unexpected response ${response.statusText}`);
            }

            await streamPipeline(response.body, createWriteStream(cachePath));


            // curl imgproxy:8080/insecure/rs:fit:300:200:no:0/plain/local:///photo.jpg
            // await fs.writeFile(`${cachePath}.${extension}`, binary);
            // tslint:disable-next-line:no-console
            console.log(`Compresion completed: ${encodeOptions.path}`)
            resolve(`${cachePath}`)
        } catch (e) {
            // tslint:disable-next-line:no-console
            console.error(e)
            reject(e)
        }
    })
}
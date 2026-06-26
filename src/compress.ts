import { createWriteStream } from 'fs';
import { writeFile } from 'fs/promises';
import { EncodeOptions } from "./types";
import { promisify } from "util";
import { pipeline } from "stream";
import fetch from "node-fetch";
import { join } from 'path';
import { awsBucketName, useS3 } from './config';
import { applyOverlay } from './overlay';

const streamPipeline = promisify(pipeline);

export default async (encodeOptions: EncodeOptions, md5: string): Promise<string> => {
    const cachePath = join(__dirname, '..', 'cache', md5);
    try {
        const { resize, format, path, quality, background, overlay } = encodeOptions
        console.log(`Compresion start: ${path}`)

        let urlParams = ''
        if (resize) {
            // imgproxy resize is positional: resizing_type:width:height:enlarge:extend.
            // Emit all positions (0 = auto) so enlarge/extend apply even without a height.
            const height = resize.height ?? 0
            const enlarge = resize.enlarge ?? '0'
            const extend = resize.extend ?? '0'
            urlParams += `resize:${resize.resizing_type}:${resize.width}:${height}:${enlarge}:${extend}/`
        }

        if (background) {
            urlParams += `bg:${background.red}:${background.green}:${background.blue}/`
        }

        if (quality) {
            urlParams += `quality:${quality}/`
        }

        let url = ''
        if (useS3) {
            let s3Path = path
            s3Path = s3Path.replace(/\/+/g, "/")
            if (s3Path[0] === "/") {
                s3Path = s3Path.slice(1);
            }

            url = `http://imgproxy:8080/insecure/${urlParams}plain/s3://${awsBucketName}/${s3Path}@${format}`
        } else {
            url = `http://imgproxy:8080/insecure/${urlParams}plain/local://${path}@${format}`
        }
        console.log('Request to: ' + url)

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Unexpected response ${response.statusText}`);
        }

        if (overlay) {
            // imgproxy resizes/transcodes; sharp paints the overlay on top, then we cache the result.
            const resized = Buffer.from(await response.arrayBuffer());
            const composited = await applyOverlay(resized, overlay, format, quality);
            await writeFile(cachePath, composited);
        } else {
            await streamPipeline(response.body, createWriteStream(cachePath));
        }

        console.log(`Compresion completed: ${path}`)
        return cachePath
    } catch (e) {
        console.error(e)
        throw e
    }
}

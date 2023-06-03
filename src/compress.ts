import { createWriteStream } from 'fs';
// @ts-ignore
import { EncodeOptions } from "./types";
import { promisify } from "util";
import { pipeline } from "stream";
import fetch from "node-fetch";
import { join } from 'path';
import { aws_bucket_name, use_s3 } from './config';


export default (encodeOptions: EncodeOptions, md5: string): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        const cachePath = join(__dirname, '..', 'cache', md5);
        try {
            const { resize, format, path, quality, background } = encodeOptions
            // tslint:disable-next-line:no-console
            console.log(`Compresion start: ${path}`)

            let urlParams = ''
            if (resize) {
                let height = resize.height ? `:${resize.height}` : ''
                if (height !== '') {
                    const enlarge = resize.enlarge ? `${resize.enlarge}` : '0'
                    const extend = resize.extend ? `${resize.extend}` : '0'
                    height += `:${enlarge}:${extend}`
                }

                urlParams += `resize:${resize.resizing_type}:${resize.width}${height}/`
            }

            if (background) {
                urlParams += `bg:${background.red}:${background.green}:${background.blue}/`
            }

            if (quality) {
                urlParams += `quality:${quality}/`
            }

            let url = ''
            if (use_s3) {
                let s3Path = path
                s3Path = s3Path.replace(/\/+/g, "/")
                if (s3Path[0] === "/") {
                    s3Path = s3Path.slice(1);
                }

                url = `http://imgproxy:8080/insecure/${urlParams}plain/s3://${aws_bucket_name}/${s3Path}@${format}`
            } else {
                url = `http://imgproxy:8080/insecure/${urlParams}plain/local://${path}@${format}`
            }
            // tslint:disable-next-line:no-console
            console.log('Request to: ' + url)
            const streamPipeline = promisify(pipeline);
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Unexpected response ${response.statusText}`);
            }

            await streamPipeline(response.body, createWriteStream(cachePath));

            // tslint:disable-next-line:no-console
            console.log(`Compresion completed: ${path}`)
            resolve(`${cachePath}`)
        } catch (e) {
            // tslint:disable-next-line:no-console
            console.error(e)
            reject(e)
        }
    })
}
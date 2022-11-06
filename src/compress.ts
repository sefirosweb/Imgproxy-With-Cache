import path from "path";
import { createWriteStream } from 'fs';
// @ts-ignore
import { EncodeOptions } from "./types";
import { promisify } from "util";
import { pipeline } from "stream";
import fetch from "node-fetch";


export default (encodeOptions: EncodeOptions, md5: string): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        const cachePath = path.join(__dirname, '..', 'cache', md5);
        try {
            const { resize, format, path, quality } = encodeOptions
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

                if (!resize.background) {
                    urlParams += `bg:255:255:255/`
                } else {
                    urlParams += `bg:${resize.background.red}:${resize.background.green}:${resize.background.blue}/`
                }
            }

            if (quality) {
                urlParams += `quality:${quality}/`
            }

            const url = `http://imgproxy:8080/insecure/${urlParams}plain/local://${path}@${format}`

            console.log({ url })
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
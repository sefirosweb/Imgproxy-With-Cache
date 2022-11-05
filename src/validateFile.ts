import { Response } from "express"
import { existsSync } from "fs"
import crypto from "crypto";
import compress from "./compress"
import { Codecs, EncodeOptions, validFiles } from "./types"
import path from "path";
import dotenv from "dotenv";
import Semaphore from "./semaphore";

dotenv.config();
const concurrent = process.env.MAX_CONCURRENT_COMPRESION ? parseInt(process.env.MAX_CONCURRENT_COMPRESION, 10) : 1;
const throttler = new Semaphore(concurrent);

export default async (reqPath: string, query: any, res: Response, mediaPath: string) => {
    if (!existsSync(mediaPath)) {
        res.redirect(301, '/')
        return
    }

    if (Object.keys(query).length === 0) {
        res.sendFile(mediaPath)
        return
    }

    const encoding: EncodeOptions = {
        path: reqPath
    }

    if (typeof query.width === "string") {
        encoding.width = parseInt(query.width, 10);
    }
    if (typeof query.height === "string") {
        encoding.height = parseInt(query.height, 10);
    }
    if (typeof query.quality === "string") {
        encoding.quality = parseInt(query.quality, 10);
    }

    if (isCodec(query.encode)) {
        encoding.encode = query.encode;
    }


    const md5 = crypto.createHash('md5').update(JSON.stringify(encoding)).digest("hex")

    let found = false
    validFiles.every(validFile => {
        const cachePath = path.join(__dirname, '..', 'cache', md5 + validFile);
        if (existsSync(cachePath)) {
            res.sendFile(cachePath)
            found = true
            return false
        }
        return true
    })


    if (found) return


    try {
        const filePath = await throttler.callFunction(() => compress(encoding, md5))
        res.sendFile(filePath)
    } catch {
        const fileError = path.join(__dirname, 'views', 'error-file.png');
        res.sendFile(fileError)
    }
}

function isCodec(encode: any): encode is Codecs {
    return typeof encode === "string" && Object.values(Codecs).includes(encode as Codecs)
}
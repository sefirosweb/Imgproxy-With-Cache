import { Response } from "express"
import { existsSync } from "fs"
import crypto from "crypto";
import compress from "./compress"
import { Formats, EncodeOptions, ResizingType } from "./types"
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
        path: reqPath,
        format: Formats.jpg
    }

    const format = query.format ?? Formats.jpg
    if (isFormat(format)) {
        encoding.format = format;
    }

    if (typeof query.width === "string") {
        encoding.resize = {
            resizing_type: ResizingType.fit,
            width: parseInt(query.width, 10)
        }
    }

    if (encoding.resize && typeof query.height === "string") {
        encoding.resize.height = parseInt(query.height, 10);
    }

    if (encoding.resize && typeof query.enlarge === "string") {
        encoding.resize.enlarge = query.enlarge === '1' ? '1' : '0'
    }

    if (encoding.resize && typeof query.extend === "string") {
        encoding.resize.extend = query.extend === '1' ? '1' : '0'
    }

    const resizing_type = query.resizing_type ?? ''
    if (encoding.resize && isValidResizeType(resizing_type)) {
        encoding.resize.resizing_type = resizing_type;
    }

    if (typeof query.quality === "string") {
        encoding.quality = parseInt(query.quality, 10);
    }

    const md5 = crypto.createHash('md5').update(JSON.stringify(encoding)).digest("hex") + '.' + encoding.format

    const cachePath = path.join(__dirname, '..', 'cache', md5);
    if (existsSync(cachePath)) {
        res.sendFile(cachePath)
        return
    }

    try {
        const filePath = await throttler.callFunction(() => compress(encoding, md5))
        res.sendFile(filePath)
    } catch {
        const fileError = path.join(__dirname, 'views', 'error-file.png');
        res.sendFile(fileError)
    }
}

function isFormat(format: any): format is Formats {
    return typeof format === "string" && Object.values(Formats).includes(format as Formats)
}

function isValidResizeType(size: any): size is ResizingType {
    return typeof size === "string" && Object.values(ResizingType).includes(size as ResizingType)
}

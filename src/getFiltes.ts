import { readdirSync, statSync, existsSync, lstatSync } from 'fs';
import path from "path";
import { Formats } from "./types";
import { use_s3 } from "./config";
import { listBucketObjects } from './s3';

export const validFiles = Object.values(Formats).map(f => '.' + f)
export type foldersFileType = {
    folders: Array<string>,
    files: Array<{
        fileSize: number,
        name: string,
    }>,
}

const getLocalData = (mediaPath: string): foldersFileType => {
    const folders = readdirSync(mediaPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .filter(dirent => !(/(^|\/)\.[^\/\.]/g).test(dirent.name))
        .map(dirent => dirent.name)

    const files = readdirSync(mediaPath, { withFileTypes: true })
        .filter(dirent => !dirent.isDirectory())
        .filter(dirent => validFiles.includes(path.extname(dirent.name)))
        .filter(dirent => !(/(^|\/)\.[^\/\.]/g).test(dirent.name))
        .map(dirent => {
            const newFile = {
                ...dirent,
                fileSize: Math.floor(statSync(mediaPath + '/' + dirent.name).size / 1024 / 1024 * 100) / 100
            }
            return newFile
        })

    return {
        folders,
        files,
    }
}

export const getDataFromFolder = async (mediaPath: string, reqPath: string): Promise<foldersFileType> => {
    if (use_s3) {
        return await listBucketObjects(reqPath)
    }

    return getLocalData(mediaPath)
}

export const exisPath = (mediaPath: string) => {
    if (use_s3) {
        return true;
    }

    if (!existsSync(mediaPath)) return false
    return lstatSync(mediaPath)?.isDirectory()
}
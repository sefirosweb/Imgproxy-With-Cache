import path from "path";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import { readdirSync, existsSync, lstatSync } from 'fs';

dotenv.config();
const port = process.env.APP_PORT ?? 8080;
const appUrl = process.env.APP_URL ?? `http://localhost:${port}`;
const app = express();

// Configure Express to use EJS
app.set("views", path.join(__dirname, "views", "pages"));
app.set("view engine", "ejs");

import { Breadcrumb, Formats } from "./types";
import validateFile from "./validateFile";

const validFiles = Object.values(Formats).map(f => '.' + f)

app.get("/*", async (req: Request, res: Response) => {
    const reqPath = decodeURI(req.path)
    // tslint:disable-next-line:no-console
    console.log(reqPath)
    const mediaPath = path.join(__dirname, '..', 'media', reqPath);

    if (validFiles.includes(path.extname(reqPath))) {
        validateFile(reqPath, req.query, res, mediaPath)
        return
    }

    if (!existsSync(mediaPath) || !lstatSync(mediaPath).isDirectory()) {
        res.redirect(301, '/')
        return
    }

    const folders = readdirSync(mediaPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())

    const files = readdirSync(mediaPath, { withFileTypes: true })
        .filter(dirent => !dirent.isDirectory())
        .filter(dirent => validFiles.includes(path.extname(dirent.name)))

    const relativePath = reqPath === '/' ? '' : reqPath
    let breadcrumbAcumulate = ''
    const breadcrumb: Breadcrumb[] = relativePath
        .split("/")
        .filter(p => p !== '')
        .map((title) => {
            breadcrumbAcumulate += title + '/'
            return {
                title,
                path: breadcrumbAcumulate,
                active: false
            }
        })

    breadcrumb.unshift({
        title: 'home',
        path: '',
        active: false
    })

    if (breadcrumb.length !== 0) {
        breadcrumb[breadcrumb.length - 1].active = true
    }

    res.render("layout", {
        appUrl,
        path: relativePath,
        folders,
        foldersArray: breadcrumb,
        files
    });
});

app.listen(port, () => {
    // tslint:disable-next-line:no-console
    console.log(`server started at ${appUrl}`);
});
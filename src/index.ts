import path from "path";
import express, { Request, Response } from "express";
import { appUrl, port } from './config'
import { exisPath, getDataFromFolder, validFiles } from "./getFiltes";
import { Breadcrumb } from "./types";
import validateFile from "./validateFile";
import { resolveMediaPath } from "./mediaPath";

// Configure Express to use EJS
export const app = express();
app.set("views", path.join(__dirname, "views", "pages"));
app.set("view engine", "ejs");

app.get("/*", async (req: Request, res: Response) => {
    const reqPath = decodeURI(req.path)
    console.log(reqPath)

    // Prevent path traversal: reject any request whose resolved path escapes the media root
    const mediaPath = resolveMediaPath(reqPath)
    if (mediaPath === null) {
        return res.status(404).send();
    }

    if (validFiles.includes(path.extname(reqPath))) {
        return validateFile(reqPath, req.query, res, mediaPath)
    }

    if (!exisPath(mediaPath)) {
        return res.status(404).send()
    }

    const { folders, files } = await getDataFromFolder(mediaPath, reqPath)

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

// Only start listening when run directly (so tests can import `app` without binding a port)
if (require.main === module) {
    app.listen(port, () => {
        console.log(`server started at ${appUrl}`);
    });
}

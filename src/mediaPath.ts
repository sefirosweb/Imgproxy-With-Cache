import path from "path";

// Absolute path to the media root that every request is confined to.
export const mediaRoot = path.resolve(path.join(__dirname, '..', 'media'));

/**
 * Resolve a request path inside the media root.
 *
 * Returns the absolute on-disk path, or `null` if the resolved path escapes
 * the media root (a path-traversal attempt such as `/../../etc/passwd`).
 */
export const resolveMediaPath = (reqPath: string): string | null => {
    const resolved = path.resolve(path.join(mediaRoot, reqPath));
    if (resolved !== mediaRoot && !resolved.startsWith(mediaRoot + path.sep)) {
        return null;
    }
    return resolved;
};

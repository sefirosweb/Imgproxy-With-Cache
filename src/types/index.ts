export enum Codecs {
    mozjpeg = 'mozjpeg',
    avif = 'avif',
    jxl = 'jxl',
    webp = 'webp',
}

export type EncodeOptions = {
    path: string
    encode?: Codecs,
    width?: number
    height?: number
    quality?: number
}

export type Breadcrumb = {
    path: string,
    title: string,
    active: boolean
}


export const validFiles = ['.jpg', '.png', '.webp']
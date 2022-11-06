export enum Formats {
    png = 'png',
    jpg = 'jpg',
    webp = 'webp',
    avif = 'avif',
    gif = 'gif',
    ico = 'ico',
    bmp = 'bmp',
    tiff = 'tiff',
}


export enum ResizingType {
    fit = 'fit',
    fill = 'fill',
    fillDdown = 'fill-down',
    force = 'force',
    auto = 'auto',
}


export type Resize = {
    resizing_type: ResizingType,
    width: number
    height?: number
    enlarge?: '1' | '0'
    extend?: '1' | '0'
}

export type EncodeOptions = {
    path: string
    format: Formats
    resize?: Resize
    quality?: number
}

export type Breadcrumb = {
    path: string,
    title: string,
    active: boolean
}
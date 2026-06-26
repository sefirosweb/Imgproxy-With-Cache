export enum Formats {
    png = 'png',
    jpg = 'jpg',
    webp = 'webp',
    avif = 'avif',
    gif = 'gif',
    ico = 'ico',
    bmp = 'bmp',
    tiff = 'tiff',
    pdf = 'pdf',
}

export enum ResizingType {
    fit = 'fit',
    fill = 'fill',
    fillDdown = 'fill-down',
    force = 'force',
    auto = 'auto',
}

export type BackgroundRGB = {
    red: string,
    green: string,
    blue: string,
}

export type Resize = {
    resizing_type: ResizingType,
    width: number
    height?: number
    enlarge?: '1' | '0'
    extend?: '1' | '0'
}

export type OverlayPosition =
    | 'ce' | 'no' | 'so' | 'ea' | 'we' | 'noea' | 'nowe' | 'soea' | 'sowe'

export type Overlay = {
    text?: string
    image?: string            // base64-encoded image
    position: OverlayPosition
    margin: number            // px from the edge of the final (resized) image
    opacity: number           // 0..1
    size?: number             // text font size in px (text overlays)
    color?: string            // text colour, 6-hex without '#' (text overlays)
    bg?: string               // text box colour, 6-hex, or 'none' (text overlays)
    scale?: number            // image overlay size as a fraction of the base width, 0..1
}

export type EncodeOptions = {
    path: string
    format: Formats
    resize?: Resize
    quality?: number
    background?: BackgroundRGB
    overlay?: Overlay
}

export type Breadcrumb = {
    path: string,
    title: string,
    active: boolean
}
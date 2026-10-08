import type { Plugin } from 'vite'

type UniwindConfig = {
    cssEntryFile: string
    extraThemes?: Array<string>
    dtsFile?: string
    /**
     * Starts root `Text` and `TextInput` from the theme's `--default-font-family`, which Tailwind
     * derives from `--font-sans`.
     * @default false
     */
    defaultFontFamily?: boolean
}

export declare function uniwind(config: UniwindConfig): Plugin

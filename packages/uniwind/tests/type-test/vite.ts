import { uniwind } from 'uniwind/vite'

uniwind({
    cssEntryFile: './global.css',
    defaultFontFamily: true,
})

uniwind({
    cssEntryFile: './global.css',
    // @ts-expect-error The family itself comes from the theme's --default-font-family.
    defaultFontFamily: 'Inter',
})

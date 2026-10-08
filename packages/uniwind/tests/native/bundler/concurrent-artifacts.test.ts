import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { projectArtifactPath, transform } from '../../../src/bundler/adapters/metro/transformer'

jest.mock('metro-transform-worker', () => ({
    transform: async (_config: unknown, _projectRoot: string, _filePath: string, data: Buffer) => ({
        output: [{ data: { code: data.toString('utf8') } }],
    }),
}))

const createProject = (directory: string, name: string, className: string, ...cssLines: Array<string>) => {
    const projectDirectory = path.join(directory, name)
    const cssPath = path.join(projectDirectory, 'global.css')

    mkdirSync(projectDirectory)
    writeFileSync(cssPath, ['@import "tailwindcss";', '@import "uniwind";', ...cssLines].join('\n'))
    writeFileSync(path.join(projectDirectory, 'App.tsx'), `export const className = '${className}'`)

    return cssPath
}

const transformCSS = (cssPath: string, extraThemes: Array<string>) =>
    transform(
        {
            uniwind: {
                cssEntryFile: path.relative(process.cwd(), cssPath),
                dtsFile: path.join(path.dirname(cssPath), 'uniwind-types.d.ts'),
                extraThemes,
            },
        } as unknown as Parameters<typeof transform>[0],
        process.cwd(),
        path.relative(process.cwd(), cssPath),
        Buffer.from(''),
        {
            customTransformOptions: {},
            dev: false,
            inlinePlatform: true,
            inlineRequires: false,
            minify: false,
            platform: 'android',
            type: 'module',
            unstable_transformProfile: 'default',
        },
    ).then(result => result.output[0]?.data.code as string)

describe('concurrent project artifacts', () => {
    test('compiles each project against its own themes when builds overlap', async () => {
        const directory = mkdtempSync(path.join(process.cwd(), '.tmp-concurrent-artifacts-'))
        const oceanCSSPath = createProject(directory, 'ocean', 'ocean:bg-red-500')
        const plainCSSPath = createProject(directory, 'plain', 'bg-blue-500')

        try {
            const outputs = await Promise.all(
                Array.from({ length: 4 }, (_, index) =>
                    index % 2 === 0
                        ? transformCSS(oceanCSSPath, ['ocean'])
                        : transformCSS(plainCSSPath, [])),
            )

            outputs.forEach((code, index) => {
                if (index % 2 === 0) {
                    expect(code).toContain('"className": "ocean:bg-red-500"')
                } else {
                    expect(code).toContain('"className": "bg-blue-500"')
                }
            })
            expect(projectArtifactPath(oceanCSSPath)).not.toBe(projectArtifactPath(plainCSSPath))
        } finally {
            rmSync(directory, { force: true, recursive: true })
            ;[oceanCSSPath, plainCSSPath].map(projectArtifactPath).filter(existsSync).forEach(artifactPath => {
                rmSync(artifactPath, { force: true })
            })
        }
    })

    test('discovers each project\'s theme variants when builds with different themes overlap', async () => {
        const directory = mkdtempSync(path.join(process.cwd(), '.tmp-concurrent-artifacts-'))
        // Neither project's artifact exists yet, and the shared uniwind.css their `@import "uniwind"`
        // resolves to declares neither extra theme nor the theme variable both entries apply.
        const themeBlock = (theme: string, color: string) =>
            [
                '@layer theme {',
                '    :root {',
                '        @variant light { --color-surface: #ffffff; }',
                '        @variant dark { --color-surface: #000000; }',
                `        @variant ${theme} { --color-surface: ${color}; }`,
                '    }',
                '}',
            ].join('\n')
        const applyBlock = '@layer components { .card { @apply bg-surface; } }'
        const oceanCSSPath = createProject(directory, 'ocean', 'bg-surface', themeBlock('ocean', '#0000ff'), applyBlock)
        const forestCSSPath = createProject(directory, 'forest', 'bg-surface', themeBlock('forest', '#00ff00'), applyBlock)

        try {
            const outputs = await Promise.all(
                Array.from({ length: 4 }, (_, index) =>
                    index % 2 === 0
                        ? transformCSS(oceanCSSPath, ['ocean'])
                        : transformCSS(forestCSSPath, ['forest'])),
            )

            outputs.forEach((code, index) => {
                const [theme, color, otherTheme] = index % 2 === 0
                    ? ['ocean', '#0000ff', 'forest']
                    : ['forest', '#00ff00', 'ocean']

                expect(code).toContain('"className": "bg-surface"')
                expect(code).toContain(`"__uniwind-theme-${theme}": ({ "--color-surface": vars => "${color}", })`)
                expect(code).not.toContain(otherTheme)
            })
        } finally {
            rmSync(directory, { force: true, recursive: true })
            ;[oceanCSSPath, forestCSSPath].map(projectArtifactPath).filter(existsSync).forEach(artifactPath => {
                rmSync(artifactPath, { force: true })
            })
        }
    })
})

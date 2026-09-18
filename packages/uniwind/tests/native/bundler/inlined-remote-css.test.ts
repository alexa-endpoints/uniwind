import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { transform } from '../../../src/bundler/adapters/metro/transformer'
import { UniwindBundlerConfig } from '../../../src/bundler/config'
import { Uniwind } from '../../../src/core/config/config.native'
import { UniwindStore } from '../../../src/core/native'
import type { ComponentState } from '../../../src/core/types'

const mockWorkerTransform = jest.fn(
    async (
        _config: unknown,
        _projectRoot: string,
        _filePath: string,
        data: Buffer,
    ) => ({
        output: [
            {
                data: {
                    code: data.toString('utf8'),
                },
            },
        ],
    }),
)

jest.mock('metro-transform-worker', () => ({
    transform: mockWorkerTransform,
}))

const transformCSS = (
    uniwind: Parameters<typeof transform>[0]['uniwind'],
    projectRoot: string,
    cssPath: string,
    platform: 'android' | 'web' = 'android',
) => transform(
    {
        uniwind,
    } as Parameters<typeof transform>[0],
    projectRoot,
    path.relative(projectRoot, cssPath),
    Buffer.from(''),
    {
        customTransformOptions: {},
        dev: false,
        inlinePlatform: true,
        inlineRequires: false,
        minify: false,
        platform,
        type: 'module',
        unstable_transformProfile: 'default',
    },
)

describe('inlined remote CSS', () => {
    test('compiles a host-declared stylesheet as a remote while preserving host artifacts', async () => {
        const directory = mkdtempSync(path.join(process.cwd(), '.tmp-inlined-remote-css-'))
        const hostDirectory = path.join(directory, 'host')
        const remoteDirectory = path.join(directory, 'remote')
        const hostCSSPath = path.join(hostDirectory, 'global.css')
        const remoteCSSPath = path.join(remoteDirectory, 'global.css')

        mkdirSync(hostDirectory)
        mkdirSync(remoteDirectory)
        writeFileSync(hostCSSPath, '@import "tailwindcss";')
        writeFileSync(
            remoteCSSPath,
            [
                '@layer theme, base, components, utilities;',
                '@import "tailwindcss/theme.css" layer(theme) prefix(rmt);',
                '@import "tailwindcss/utilities.css" layer(utilities) prefix(rmt);',
                '@import "uniwind";',
            ].join('\n'),
        )
        writeFileSync(
            path.join(remoteDirectory, 'Remote.tsx'),
            `export const className = 'bg-red-500 rmt:bg-blue-500'`,
        )

        const artifactCSSPaths: string[] = []
        jest.spyOn(UniwindBundlerConfig.prototype, 'generateArtifacts').mockImplementation(
            function(this: UniwindBundlerConfig) {
                artifactCSSPaths.push(this.cssPath)
                return Promise.resolve()
            },
        )

        const uniwind = {
            cssEntryFile: path.relative(process.cwd(), hostCSSPath),
            experimental: {
                federation: {
                    role: 'host' as const,
                    sharedClassNames: ['bg-red-500'],
                    inlinedRemotes: [
                        {
                            id: 'remote-a',
                            cssEntryFile: remoteCSSPath,
                            sharedClassNames: ['bg-red-500'],
                        },
                    ],
                },
            },
        }

        try {
            const host = await transformCSS(uniwind, process.cwd(), hostCSSPath)
            const remote = await transformCSS(uniwind, process.cwd(), remoteCSSPath)
            const remoteWeb = await transformCSS(uniwind, process.cwd(), remoteCSSPath, 'web')
            const hostCode = host.output[0]?.data.code
            const remoteCode = remote.output[0]?.data.code
            const remoteWebCode = remoteWeb.output[0]?.data.code

            expect(hostCode).toContain('Uniwind.__reinit(')
            expect(hostCode).toContain('"className": "bg-red-500"')
            expect(remoteCode).toContain('Uniwind.__mergeStyles("remote-a"')
            expect(remoteCode).toContain('"className": "rmt:bg-blue-500"')
            expect(remoteCode).not.toContain('"className": "bg-red-500"')
            expect(remoteWebCode).toContain('.rmt\\:bg-blue-500')
            expect(remoteWebCode).not.toContain('Uniwind.__mergeStyles')
            expect(artifactCSSPaths).toEqual([hostCSSPath, hostCSSPath, hostCSSPath])
        } finally {
            rmSync(directory, { force: true, recursive: true })
        }
    })

    test('cascades an inlined remote as if its stylesheet followed the host stylesheet', async () => {
        const directory = mkdtempSync(path.join(process.cwd(), '.tmp-inlined-remote-css-'))
        const hostDirectory = path.join(directory, 'host')
        const remoteDirectory = path.join(directory, 'remote')
        const hostCSSPath = path.join(hostDirectory, 'global.css')
        const remoteCSSPath = path.join(remoteDirectory, 'global.css')
        const disposers: Array<VoidFunction> = []

        mkdirSync(hostDirectory)
        mkdirSync(remoteDirectory)
        writeFileSync(hostCSSPath, '@import "tailwindcss";')
        writeFileSync(
            remoteCSSPath,
            [
                '@layer theme, base, components, utilities;',
                '@import "tailwindcss/theme.css" layer(theme) prefix(rmt);',
                '@import "tailwindcss/utilities.css" layer(utilities) prefix(rmt);',
                '@import "uniwind";',
            ].join('\n'),
        )
        writeFileSync(path.join(hostDirectory, 'Host.tsx'), `export const className = 'opacity-25 active:opacity-75'`)
        writeFileSync(path.join(remoteDirectory, 'Remote.tsx'), `export const className = 'rmt:opacity-50 rmt:active:opacity-90'`)

        jest.spyOn(UniwindBundlerConfig.prototype, 'generateArtifacts').mockImplementation(
            function(this: UniwindBundlerConfig) {
                return Promise.resolve()
            },
        )

        const uniwind = {
            cssEntryFile: path.relative(process.cwd(), hostCSSPath),
            experimental: {
                federation: {
                    role: 'host' as const,
                    inlinedRemotes: [{ id: 'remote-a', cssEntryFile: remoteCSSPath }],
                },
            },
        }
        // Evaluates a generated stylesheet module as Metro would, with `uniwind` resolving to this runtime.
        const evaluate = (code: string) =>
            new Function('require', 'module', code)(
                (request: string) => {
                    expect(request).toBe('uniwind')

                    return { Uniwind }
                },
                { hot: { dispose: (dispose: VoidFunction) => disposers.push(dispose) } },
            )
        const opacity = (className: string, state?: ComponentState) =>
            UniwindStore.getStyles(className, undefined, state, { rtl: null, scopedTheme: null, variables: null }).styles.opacity

        try {
            const host = await transformCSS(uniwind, process.cwd(), hostCSSPath)
            const remote = await transformCSS(uniwind, process.cwd(), remoteCSSPath)
            const remoteCode = remote.output[0]?.data.code

            expect(remoteCode).toContain('Uniwind.__mergeStyles("remote-a"')
            expect(remoteCode).toContain('cascade: {"layers":')

            evaluate(host.output[0]?.data.code)
            evaluate(remoteCode)

            // Same layer and specificity: the inlined remote follows the host, whatever the className order.
            expect(opacity('opacity-25 rmt:opacity-50')).toBe(0.5)
            expect(opacity('rmt:opacity-50 opacity-25')).toBe(0.5)
            // A state variant outranks a plain utility from either stylesheet.
            expect(opacity('active:opacity-75 rmt:opacity-50', { isPressed: true })).toBe(0.75)
            expect(opacity('rmt:active:opacity-90 active:opacity-75', { isPressed: true })).toBe(0.9)
            expect(opacity('rmt:active:opacity-90 opacity-25')).toBe(0.25)
        } finally {
            disposers.splice(0).forEach(dispose => dispose())
            rmSync(directory, { force: true, recursive: true })
        }
    })
})

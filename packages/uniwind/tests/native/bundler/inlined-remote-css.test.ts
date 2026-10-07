import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { projectArtifactPath, transform } from '../../../src/bundler/adapters/metro/transformer'
import { UniwindBundlerConfig } from '../../../src/bundler/config'

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
            function(this: UniwindBundlerConfig, artifactPath: string) {
                artifactCSSPaths.push(this.cssPath)
                copyFileSync(path.resolve('uniwind.css'), artifactPath)
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
            rmSync(projectArtifactPath(hostCSSPath), { force: true })
        }
    })
})

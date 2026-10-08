import fs from 'node:fs'
import path from 'node:path'
import { sharedArtifactPath } from '../../../src/bundler/adapters/metro/artifact-paths'
import { projectArtifactPath, transform } from '../../../src/bundler/adapters/metro/transformer'
import { UniwindBundlerConfig } from '../../../src/bundler/config'
import { Logger } from '../../../src/bundler/logger'
import type { UniwindMetroConfig } from '../../../src/bundler/types'

jest.mock('metro-transform-worker', () => ({
    transform: async (_config: unknown, _projectRoot: string, _filePath: string, data: Buffer) => ({
        output: [{ data: { code: data.toString('utf8') } }],
    }),
}))

jest.mock('../../../src/bundler/adapters/metro/artifact-paths', () => require('./temporaryArtifactPaths'))

const THEME_VARIABLES = '@layer theme { :root { @variant light { --color-brand: #ff0000; } @variant dark { --color-brand: #0000ff; } } }'

let directory = ''
let projects = 0

beforeAll(() => {
    directory = fs.mkdtempSync(path.join(process.cwd(), '.tmp-shared-artifact-'))
})

afterAll(() => {
    fs.rmSync(directory, { force: true, recursive: true })
})

afterEach(() => {
    jest.restoreAllMocks()
})

const writeEntry = (cssPath: string, ...cssLines: Array<string>) => {
    fs.writeFileSync(cssPath, ['@import "tailwindcss";', '@import "uniwind";', ...cssLines].join('\n'))
}

const createProject = (extraThemes: Array<string> = []): UniwindMetroConfig => {
    const projectDirectory = path.join(directory, `project-${projects++}`)
    const cssPath = path.join(projectDirectory, 'global.css')

    fs.mkdirSync(projectDirectory)
    writeEntry(cssPath)
    fs.writeFileSync(path.join(projectDirectory, 'App.tsx'), `export const className = 'p-4'`)

    return {
        cssEntryFile: path.relative(process.cwd(), cssPath),
        dtsFile: path.join(projectDirectory, 'uniwind-types.d.ts'),
        extraThemes,
    }
}

const transformCSS = (uniwind: UniwindMetroConfig) =>
    transform(
        { uniwind } as unknown as Parameters<typeof transform>[0],
        process.cwd(),
        uniwind.cssEntryFile,
        Buffer.from(''),
        {
            customTransformOptions: {},
            dev: true,
            inlinePlatform: true,
            inlineRequires: false,
            minify: false,
            platform: 'android',
            type: 'module',
            unstable_transformProfile: 'default',
        },
    ).then(result => result.output[0]?.data.code as string)

const artifactOf = (uniwind: UniwindMetroConfig) => fs.readFileSync(projectArtifactPath(UniwindBundlerConfig.fromMetroConfig(uniwind)), 'utf-8')

const readShared = () => fs.existsSync(sharedArtifactPath) ? fs.readFileSync(sharedArtifactPath, 'utf-8') : undefined

// A rename swaps the inode, so an unchanged inode proves a transform wrote nothing at all.
const sharedInode = () => fs.statSync(sharedArtifactPath).ino

describe('shared uniwind.css', () => {
    test('a warm transform leaves it alone', async () => {
        const project = createProject(['warm'])

        await transformCSS(project)

        expect(readShared()).toBe(artifactOf(project))

        const inode = sharedInode()

        await transformCSS(project)

        expect(sharedInode()).toBe(inode)
        expect(readShared()).toBe(artifactOf(project))
    })

    test('a project whose artifact it already holds, as in another Metro worker, leaves it alone', async () => {
        const [first, second] = [createProject(['twin']), createProject(['twin'])]

        await transformCSS(first)

        const inode = sharedInode()

        await transformCSS(second)

        expect(artifactOf(second)).toBe(artifactOf(first))
        expect(sharedInode()).toBe(inode)
    })

    test('alternating projects do not rewrite it on every transform', async () => {
        const [ocean, forest] = [createProject(['ocean']), createProject(['forest'])]

        await transformCSS(ocean)
        await transformCSS(forest)

        expect(readShared()).toBe(artifactOf(forest))

        const inode = sharedInode()

        for (let round = 0; round < 3; round++) {
            await transformCSS(ocean)
            await transformCSS(forest)

            expect(sharedInode()).toBe(inode)
        }

        // A last-writer copy: it holds the project whose artifact changed last.
        expect(readShared()).toBe(artifactOf(forest))
    })

    test('takes a project\'s artifact again once it changes', async () => {
        const [sky, sea] = [createProject(['sky']), createProject(['sea'])]

        await transformCSS(sky)
        await transformCSS(sea)
        writeEntry(path.join(process.cwd(), sky.cssEntryFile), THEME_VARIABLES)
        await transformCSS(sky)

        expect(artifactOf(sky)).toContain('--color-brand')
        expect(readShared()).toBe(artifactOf(sky))
    })

    test('a read-only target does not fail the build', async () => {
        const writeFileSync = fs.writeFileSync
        const warn = jest.spyOn(Logger, 'warn').mockImplementation(() => {})
        let code = ''

        // The package directory refuses the temporary file the copy is written through. Each project's
        // own artifact lives in a subdirectory, which stays writable.
        jest.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => {
            if (path.dirname(String(file)) === path.dirname(sharedArtifactPath)) {
                throw Object.assign(new Error(`${code}: permission denied, open '${String(file)}'`), { code })
            }

            return writeFileSync(file, ...args)
        })

        const before = readShared()

        for (const errorCode of ['EACCES', 'EROFS', 'EPERM']) {
            const project = createProject([errorCode.toLowerCase()])

            code = errorCode

            await expect(transformCSS(project)).resolves.toContain('Uniwind.__reinit(')
            await expect(transformCSS(project)).resolves.toContain('Uniwind.__reinit(')
            expect(artifactOf(project)).toContain(`@custom-variant ${errorCode.toLowerCase()}`)
        }

        expect(readShared()).toBe(before)
        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn.mock.calls[0]?.[0]).toContain(sharedArtifactPath)
        expect(warn.mock.calls[0]?.[0]).toContain('EACCES')
    })
})

// A read-only install refuses every write inside the package: the shared copy and each project's
// artifact. Only the copy is best-effort; the build compiles against the project's artifact.
const refuseWritesInPackage = () => {
    const packageDirectory = path.dirname(sharedArtifactPath)
    const isInPackage = (file: unknown) => String(file).startsWith(`${packageDirectory}${path.sep}`)
    const refuse = (file: unknown) => Object.assign(new Error(`EACCES: permission denied, open '${String(file)}'`), { code: 'EACCES' })
    const { mkdirSync, writeFileSync } = fs

    jest.spyOn(Logger, 'warn').mockImplementation(() => {})
    jest.spyOn(fs, 'mkdirSync').mockImplementation((directory, ...args) => {
        if (isInPackage(directory) && !fs.existsSync(directory)) {
            throw refuse(directory)
        }

        return mkdirSync(directory, ...args)
    })
    jest.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => {
        if (isInPackage(file)) {
            throw refuse(file)
        }

        return writeFileSync(file, ...args)
    })
}

describe('read-only install', () => {
    test('builds a project whose artifact is already current', async () => {
        const project = createProject(['current'])

        await transformCSS(project)
        refuseWritesInPackage()

        await expect(transformCSS(project)).resolves.toContain('Uniwind.__reinit(')
    })

    test('fails a project whose artifact is missing', async () => {
        const project = createProject(['missing'])

        refuseWritesInPackage()

        await expect(transformCSS(project)).rejects.toMatchObject({ code: 'EACCES' })
    })
})

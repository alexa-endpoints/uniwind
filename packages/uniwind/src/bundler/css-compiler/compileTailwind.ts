import { compile } from '@tailwindcss/node'
import { Scanner } from '@tailwindcss/oxide'
import fs from 'fs'
import path from 'path'
import type { UniwindBundlerConfig } from '../config'

export type CompileTailwindOptions = {
    // The stylesheet `@import "uniwind"` resolves to, by default the package's own `uniwind.css`.
    artifactPath?: string
    // Receives the files Tailwind reports for the entry: imported stylesheets, and the `@plugin` and
    // `@config` modules with the files they import.
    onDependency?: (dependency: string) => void
}

export const compileTailwind = async (
    bundlerConfig: UniwindBundlerConfig,
    { artifactPath, onDependency = () => void 0 }: CompileTailwindOptions = {},
) => {
    const css = await fs.promises.readFile(bundlerConfig.cssPath, 'utf-8')
    const compiler = await compile(css, {
        base: path.dirname(bundlerConfig.cssPath),
        onDependency,
        customCssResolver: async id => id === 'uniwind' ? artifactPath : undefined,
    })
    const scanner = new Scanner({
        sources: [
            ...compiler.sources,
            {
                negated: false,
                pattern: '**/*',
                base: path.dirname(bundlerConfig.cssPath),
            },
        ],
    })
    const scannedCandidates = scanner.scan()
    const sharedClassNames = new Set(bundlerConfig.sharedClassNames)
    let candidates = scannedCandidates

    if (bundlerConfig.isFederationHost) {
        candidates = Array.from(new Set([...scannedCandidates, ...sharedClassNames]))
    } else if (bundlerConfig.isFederationRemote) {
        candidates = scannedCandidates.filter(candidate => !sharedClassNames.has(candidate))
    }

    return compiler.build(candidates)
}

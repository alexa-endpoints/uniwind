import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { UniwindBundlerConfig } from '../src/bundler/config'
import { compileCSS } from '../src/bundler/css-compiler'
import type { UniwindMetroConfig } from '../src/bundler/types'
import type { Platform } from '../src/common/consts'

// Compiles a config's CSS entry against the artifact the config generates, as the Metro transformer does, rather
// than against the package's shared uniwind.css that other suites rewrite. The artifact and the generated typings
// are written to a temporary directory, removed afterwards.
export const compileWithArtifact = async (config: UniwindMetroConfig, platform: Platform) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'uniwind-artifact-'))
    const artifactPath = path.join(directory, 'uniwind.css')
    const bundlerConfig = UniwindBundlerConfig.fromMetroConfig(
        { dtsFile: path.join(directory, 'uniwind-types.d.ts'), ...config },
        platform,
    )

    try {
        await bundlerConfig.generateArtifacts(artifactPath)

        return {
            artifact: readFileSync(artifactPath, 'utf-8'),
            bundlerConfig,
            code: await compileCSS(bundlerConfig, { artifactPath }),
        }
    } finally {
        rmSync(directory, { force: true, recursive: true })
    }
}

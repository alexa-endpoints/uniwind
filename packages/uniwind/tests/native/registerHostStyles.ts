import type { UniwindConfig } from '../../src/bundler/types'
import { Platform } from '../../src/common/consts'
import { Uniwind } from '../../src/core/config/config.native'
import { compileWithArtifact } from '../compileWithArtifact'

const compiled = new Map<string, ReturnType<typeof compileWithArtifact>>()

const compile = (config: Partial<UniwindConfig>) => {
    const key = JSON.stringify(config)
    let result = compiled.get(key)

    if (result === undefined) {
        result = compileWithArtifact({ cssEntryFile: './tests/test.css', ...config }, Platform.iOS)
        compiled.set(key, result)
    }

    return result
}

// Registers tests/test.css with the arguments the host's generated stylesheet module passes to `Uniwind.__reinit`.
export const registerHostStyles = async (config: Partial<UniwindConfig> = {}) => {
    const { code, bundlerConfig } = await compile(config)

    new Function(
        'Uniwind',
        `Uniwind.__reinit(rt => ${code}, ${bundlerConfig.stringifiedThemes}, undefined, ${bundlerConfig.stringifiedRuntimeOptions})`,
    )(
        Uniwind,
    )
}

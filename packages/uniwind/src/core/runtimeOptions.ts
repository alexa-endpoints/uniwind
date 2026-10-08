import type { UniwindRuntimeOptions } from './types'

// Set by the host's generated stylesheet registration (`Uniwind.__reinit`), never by a federated
// remote's, and read while rendering.
export const runtimeOptions: Required<UniwindRuntimeOptions> = {
    defaultFontFamily: false,
}

export const setRuntimeOptions = (options: UniwindRuntimeOptions) => {
    runtimeOptions.defaultFontFamily = options.defaultFontFamily === true
}

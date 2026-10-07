import { Platform } from '@/common/consts'
import type { UniwindBundlerConfig } from '../config'
import { compileNativeCSS } from './compileNativeCSS'
import { compileTailwind, type CompileTailwindOptions } from './compileTailwind'
import { compileWebCSS } from './compileWebCSS'

export const compileCSS = async (bundlerConfig: UniwindBundlerConfig, options?: CompileTailwindOptions) => {
    const tailwindCSS = await compileTailwind(bundlerConfig, options)

    if (bundlerConfig.platform === Platform.Web) {
        return compileWebCSS(bundlerConfig, tailwindCSS)
    }

    return compileNativeCSS(bundlerConfig, tailwindCSS)
}

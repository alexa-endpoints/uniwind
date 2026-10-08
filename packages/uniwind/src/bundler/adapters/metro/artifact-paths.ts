import path from 'path'

// The installed package, which the built transformer runs from (`dist/metro`), holds both artifact
// paths. From the sources it resolves to `src/bundler`, so tests that run CSS transforms mock this
// module. Development builds never require a stylesheet inside it, because the transform writes them.
export const packageDirectory = path.resolve(__dirname, '../..')

// The package's own stylesheet, its `style` export, kept for tools that import it directly.
export const sharedArtifactPath = path.join(packageDirectory, 'uniwind.css')

// The generated stylesheets that projects compile against, one per artifact key.
export const projectArtifactsDirectory = path.join(packageDirectory, '.artifacts')

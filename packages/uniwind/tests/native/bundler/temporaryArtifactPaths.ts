import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

// Stands in for the Metro adapter's artifact paths in tests that run CSS transforms:
//
//     jest.mock('../../../src/bundler/adapters/metro/artifact-paths', () => require('./temporaryArtifactPaths'))
//
// From the sources those paths resolve inside src/bundler, which npm publishes. Each test file gets its
// own directory, removed after its tests, so test files running in parallel never touch each other's.
const directory = mkdtempSync(path.join(tmpdir(), 'uniwind-metro-artifacts-'))

afterAll(() => {
    rmSync(directory, { force: true, recursive: true })
})

export const packageDirectory = directory
export const sharedArtifactPath = path.join(directory, 'uniwind.css')
export const projectArtifactsDirectory = path.join(directory, '.artifacts')

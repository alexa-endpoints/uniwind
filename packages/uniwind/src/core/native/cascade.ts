import type { CascadeTable, Style } from '../types'

type Layer = {
    order: Array<number>
    children: Map<string, Layer>
    size: number
}

type Bucket = {
    order: Array<number>
    specificity: number
    registration: number
    start: number
    rank: number
    importantRank: number
}

// Far more rules than one compiled stylesheet holds for a single layer and specificity.
const RANKS_PER_BUCKET = 2 ** 20

// A registration without a table ranks all its rules as one unlayered run.
const unlayeredTable: CascadeTable = { layers: [], buckets: [[-1, 0, 0]] }

// Declarations directly in a layer follow its sublayers; unlayered rules follow all layers.
const compareLayers = (a: Array<number>, b: Array<number>) => {
    for (let index = 0; index < Math.max(a.length, b.length); index++) {
        const left = a[index] ?? Infinity
        const right = b[index] ?? Infinity

        if (left !== right) {
            return left > right ? 1 : -1
        }
    }

    return 0
}

// Ranks the rules of separately compiled registrations as if their stylesheets were concatenated in registration
// order: layers merge by name and keep the order they were first declared in, then rules compare by specificity,
// registration and their own rank. Important ranks stay above every normal rank.
export const createCascadeRanker = (tables: Array<CascadeTable | undefined>) => {
    const root: Layer = { order: [], children: new Map(), size: 0 }
    const registrationBuckets = tables.map((table = unlayeredTable, registration) => {
        const layers: Array<Layer> = []

        for (const [parentIndex, name] of table.layers) {
            const parent = layers[parentIndex] ?? root
            let layer = name === null ? undefined : parent.children.get(name)

            if (!layer) {
                layer = { order: [...parent.order, parent.size++], children: new Map(), size: 0 }

                if (name !== null) {
                    parent.children.set(name, layer)
                }
            }

            layers.push(layer)
        }

        return table.buckets.map(([layer, specificity, start]): Bucket => ({
            order: layers[layer]?.order ?? root.order,
            specificity,
            registration,
            start,
            rank: 0,
            importantRank: 0,
        }))
    })
    const buckets = registrationBuckets.flat()

    for (const important of [false, true]) {
        buckets.sort((a, b) =>
            compareLayers(a.order, b.order) * (important ? -1 : 1)
            || a.specificity - b.specificity
            || a.registration - b.registration
        )
        buckets.forEach((bucket, index) => {
            bucket[important ? 'importantRank' : 'rank'] = (index + (important ? buckets.length : 0)) * RANKS_PER_BUCKET
        })
    }

    return (registration: number, style: Style): Style => {
        let bucket: Bucket | undefined

        for (const candidate of registrationBuckets[registration] ?? []) {
            if (bucket !== undefined && candidate.start > style.complexity) {
                break
            }

            bucket = candidate
        }

        if (bucket === undefined) {
            return style
        }

        // A rule keeps its place within its run, which is the same for normal and important declarations.
        const offset = style.complexity - bucket.start

        return {
            ...style,
            complexity: bucket.rank + offset,
            importantComplexity: bucket.importantRank + offset,
        }
    }
}

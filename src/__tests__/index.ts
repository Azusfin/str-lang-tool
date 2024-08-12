import benny from "benny"
import { Reader, Transformer } from "../"

import { text, blocks, factories as readerFactories } from "./read"
import { factories as transformerFactories } from "./transform"

console.log()
console.log(`Text Length: ${text.length}`)
benny.suite(
    "Benchmark",
    benny.add("Read", () => {
        const reader = new Reader({ text, factories: readerFactories })
        return reader.read()
    }),
    benny.add("Transformer", () => {
        const transformer = new Transformer({ blocks, factories: transformerFactories })
        return transformer.transform()
    }),
    benny.cycle((_, summary) => {
        const progress = (
            (summary.results.filter((result) => result.samples !== 0).length /
                summary.results.length) *
                100
        ).toFixed(2)

        const progressInfo = `Progress: ${progress}%`

        const output = summary.results
            .map(item => {
                const ops = item.ops.toLocaleString("en-us")
                const margin = item.margin.toFixed(2)

                return item.samples
                    ? `\n  ${item.name}:\n`
                        + `      ${ops} ops/s, ±${margin}% (${item.samples} samples)`
                    : null
            })
            .filter(item => item !== null)
            .join("\n")

        return `${progressInfo}\n${output}`
    })
)

/* eslint-disable typescript/promise-function-async */

import { readFile } from "node:fs/promises"
import { suite, add, cycle } from "benny"
import type { Parent } from "unist"
import { read } from "./read"
import { transform } from "./transform"

(async () => {
    const text1 = await readFile("tests/test1.txt", "utf8")
    const text2 = await readFile("tests/test2.txt", "utf8")
    const text3 = text1.repeat(50) + text2.repeat(100)

    const readRes1 = await read(text1)
    const readRes2 = await read(text2)
    const readRes3 = await read(text3)

    await suite(
        "Benchmark",
        add(`Reader 1 ${text1.length}`, () => read(text1)),
        add(`Transformer 1 ${size(readRes1)}`, () => transform(readRes1)),
        add(`Reader 2 ${text2.length}`, () => read(text2)),
        add(`Transformer 2 ${size(readRes2)}`, () => transform(readRes2)),
        add(`Reader 3 ${text3.length}`, () => read(text3)),
        add(`Transformer 3 ${size(readRes3)}`, () => transform(readRes3)),
        cycle((_, summary) => {
            const progress = (
                (summary.results.filter(result => result.samples !== 0).length /
                summary.results.length) *
                100
            ).toFixed(2)

            const progressInfo = `Progress: ${progress}%`

            const output = summary.results
                .map(item => {
                    const ops = item.ops.toLocaleString("en-us")
                    const margin = item.margin.toFixed(2)

                    return item.samples
                        ? `\n  ${item.name}:\n` +
                        `      ${ops} ops/s, ±${margin}% (${item.samples} samples)`
                        : null
                })
                .filter(item => item !== null)
                .join("\n")

            return `${progressInfo}\n${output}`
        })
    )
})()

function size(parent: Parent): number {
    let len = 0

    for (const node of parent.children) {
        len++
        if (Reflect.has(node, "children")) {
            len += size(node as Parent)
        }
    }

    return len
}

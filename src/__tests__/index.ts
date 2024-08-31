import { readFile } from "node:fs/promises"
import { inspect } from "node:util"
import { read } from "./read"
import { transform } from "./transform"

(async () => {
    const text1 = await readFile("tests/test1.txt", "utf8")

    const readRes1 = await read(text1)

    console.log("Reader")
    console.log(inspect(readRes1, { depth: Infinity }))

    console.log()

    const transformRes = await transform(readRes1)

    console.log("Transformer")
    console.log(inspect(transformRes, { depth: Infinity }))
})()

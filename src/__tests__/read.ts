import type { ReadFeatureFactory } from "../"
import { Reader, ScalarReadFeature, NestedReadFeature, BaseReadFeature } from "../"
import { readFileSync } from "fs"
import { inspect } from "util"

const numberChars: string[] = []
for (let i = 0; i < 10; i++) {
    numberChars.push(i.toString())
}

const alphabetChars: string[] = []
for (let i = 65; i <= 90; i++) {
    const alphabet = String.fromCharCode(i)
    alphabetChars.push(alphabet, alphabet.toLowerCase())
}

const operandChars: string[] = ["+", "-", "*", "/", "^"]
const brackets: [string, string] = ["(", ")"]

export const bracketFeatureSymbol = Symbol("BRACKET")
export const operandFeatureSymbol = Symbol("OPERAND")
export const numberFeatureSymbol = Symbol("NUMBER")
export const nameFeatureSymbol = Symbol("NAME")

class NumberReadFeature extends ScalarReadFeature {
    public constructor(reader: Reader) {
        super(reader, numberFeatureSymbol, numberChars)
    }

    public handleNext(char: string, _pos: number): string | undefined {
        if (numberChars.includes(char)) return char
    }
}

class NameReadFeature extends ScalarReadFeature {
    public constructor(reader: Reader) {
        super(reader, nameFeatureSymbol, alphabetChars)
    }

    public handleNext(char: string, pos: number): string | undefined {
        if (alphabetChars.includes(char)) return char
    }
}

class OperandReadFeature extends ScalarReadFeature {
    public constructor(reader: Reader) {
        super(reader, operandFeatureSymbol, operandChars)
    }

    public handleNext(char: string, _pos: number): string | undefined {
        if (operandChars.includes(char)) return char
    }
}

class BracketReadFeature extends NestedReadFeature {
    public constructor(reader: Reader) {
        super(reader, bracketFeatureSymbol, brackets, factories)
    }
}

class IgnoreSpaceReadFeature extends BaseReadFeature {
    public accept(char: string, pos: number): boolean {
        if (char === " " || char === "\n") return true
        return false
    }

    public next(): void {
        this.release()
    }

    public handleRelease(): void {}
}

export const factories: ReadFeatureFactory[] = [
    (reader: Reader) => new IgnoreSpaceReadFeature(reader),
    (reader: Reader) => new BracketReadFeature(reader),
    (reader: Reader) => new OperandReadFeature(reader),
    (reader: Reader) => new NumberReadFeature(reader),
    (reader: Reader) => new NameReadFeature(reader)
]

export const text = readFileSync("./tests/test.txt", "utf-8")

const reader = new Reader({ text, factories })
export const blocks = reader.read()

console.log("Reader")
console.log(inspect(blocks, false, Infinity))

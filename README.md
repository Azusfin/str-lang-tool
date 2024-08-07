# str-lang-tool

> A structured way to parse text for a language

[![NPM Version](https://img.shields.io/npm/v/str-lang-tool.svg?maxAge=3600)](https://www.npmjs.com/package/str-lang-tool)
[![NPM Downloads](https://img.shields.io/npm/dt/str-lang-tool.svg?maxAge=3600)](https://www.npmjs.com/package/str-lang-tool)

## Documentation

https://azusfin.github.io/str-lang-tool

## How
- [How to read text to parse it into blocks](#how-to-read)

### How To Read
```js
// Reads a mathematical expression then parse the numbers, operands, and brackets while ignoring spaces

const { Reader, BaseReadFeature, ScalarReadFeature, NestedReadFeature } = require("str-lang-tool")

const numberChars = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
const numberSymbol = Symbol("NUMBER")
class NumberReadFeature extends ScalarReadFeature {
    constructor(reader) {
        super(reader, numberSymbol, numberChars)
    }

    handleNext(char, _pos) {
        if (numberChars.includes(char)) return char
    }
}

const operandChars = ["+", "-", "*", "/", "^"]
const operandSymbol = Symbol("OPERAND")
class OperandReadFeature extends ScalarReadFeature {
    constructor(reader) {
        super(reader, operandSymbol, operandChars)
    }

    handleNext(char, _pos) {
        if (operandChars.includes(char)) return char
    }
}

const bracketChars = ["(", ")"]
const bracketSymbol = Symbol("BRACKET")
class BracketReadFeature extends NestedReadFeature {
    constructor(reader, factories) {
        super(reader, bracketSymbol, bracketChars, factories)
    }
}

class IgnoreSpaceReadFeature extends BaseReadFeature {
    claim(char, _pos) { return char === " " }
    next() { this.release() }
    handleRelease() {}
}

const factories = [
    (reader) => new NumberReadFeature(reader),
    (reader) => new OperandReadFeature(reader),
    (reader) => new BracketReadFeature(reader, factories),
    (reader) => new IgnoreSpaceReadFeature(reader)
]

const text = getText()
const reader = new Reader({ text, factories })

const blocks = reader.read()
```

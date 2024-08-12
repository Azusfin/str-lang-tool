# str-lang-tool

> A structured way to parse text for a language

[![NPM Version](https://img.shields.io/npm/v/str-lang-tool.svg?maxAge=3600)](https://www.npmjs.com/package/str-lang-tool)
[![NPM Downloads](https://img.shields.io/npm/dt/str-lang-tool.svg?maxAge=3600)](https://www.npmjs.com/package/str-lang-tool)

## How
- [How to read text and parse it into blocks](#how-to-read)
- [How to transform blocks into AST](#how-to-transform)

### How To Read
```js
const { Reader, BaseReadFeature, ScalarReadFeature, NestedReadFeature } = require("str-lang-tool")

// Symbol for scalar impl feature
const scalarSymbol = Symbol("SCALAR")
// The feature will only start to accept if it's the starting characters
const startChars = [...startCharacters]
class ScalarImplReadFeature extends ScalarReadFeature {
    constructor(reader) {
        super(reader, scalarSymbol, startChars)
    }

    // Return the char if the char is accepted, else don't return anything to release the feature
    handle(char) {
        if (...) return char
    }
}

// Symbol for nested impl feature
const nestedSymbol = Symbol("NESTED")
// The bracket open and bracket close for nested parsing
const brackets = [bracket1, bracket2]
class NestedImplReadFeature extends NestedReadFeature {
    constructor(reader, factories) {
        super(reader, nestedSymbol, brackets, factories)
    }
}

// Feature to ignore some chars
class IgnoreReadFeature extends BaseReadFeature {
    // Accept if the char is ignored characters
    accept(char) {
        if (...) return true
        return false
    }

    // Release the feature immediately
    next() { this.release() }
    handleRelease() { }
}

const factories = [
    (reader) => new IgnoreReadFeature(reader),
    (reader) => new NestedImplReadFeature(reader, factories),
    (reader) => new ScalarImplReadFeature(reader)
]

const text = ...
const reader = new Reader({ text, factories })

const blocks = reader.read()
```

### How To Transform
```js
const { Transformer, TransformFeature, BlockType } = require("str-lang-tool")

class Impl1TransformFeature extends TransformFeature {
    // Claim the block if it met the condition
    claim(block) {
        if (...) return true
        return false
    }

    // Handle the claimed blocks
    handle(blocks) {
        for (const block of blocks) {
            ...
        }
    }
}

const factories1 = [
    (transformer) => new Impl1TransformFeature(transformer)
]

// Feature with steps
class Impl2TransformFeature extends TransformFeature {
    constructor(transformer) {
        super(transformer)
        this.steps = 0
    }

    claim(block) {
        bool = false

        if (this.steps === 0 && ...) bool = true
        else if (this.steps === 1) {
            // Transfer the block handling to another feature
            this.transferHandle(block, {
                type: BlockType.NEST,
                value: [],
                symbol: ...,
                from: block.from
            }, factories1)
            if (this.blockTransfer) bool = true
        } else if (this.steps === 2) {
            return false
        }

        if (!bool) throw ...

        this.steps++
        return true
    }

    handle(blocks) {
        if (blocks.length !== 2) throw ...

        const first = blocks[0]
        const second = blocks[1]

        second.value.unshift(first)
        this.transformer.add(second)
    }
}

const factories = [
    (transformer) => new Impl2TransformFeature(transformer)
]

const blocks = ...
const transformer = new Transformer({ blocks, factories })

const nodes = transformer.transform()
```

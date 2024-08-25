# str-lang-tool

> A structured way to parse text for a language

[![NPM Version](https://img.shields.io/npm/v/str-lang-tool.svg?maxAge=3600)](https://www.npmjs.com/package/str-lang-tool)
[![NPM Downloads](https://img.shields.io/npm/dt/str-lang-tool.svg?maxAge=3600)](https://www.npmjs.com/package/str-lang-tool)

> Uses [Unist](https://github.com/syntax-tree/unist) (Universal Syntax Tree)

## How
- [How to read text and parse it into a tree](#how-to-read)
- [How to transform tree into another tree](#how-to-transform)

### How To Read
```js
import { Reader, ReadFeature } from "str-lang-tool"

class ReadFeature1 extends ReadFeature {
    handle() {
        if (this.done) return false /* Release feature after done */

        const char = this.ctx.char()

        if (char === /* Some character */) {
            this.ctx.ancestor.children.push(/* A Node */)
            this.done = true

            return true
        } else if (char === /* Some another character */) {
            this.done = true

            const ancestor = /* A Parent Node */
            this.ctx.ancestor.children.push(ancestor)

            // Feature succession (Let another feature take handle)
            return {
                ancestor,
                features: ctx => [new ReadFeature2(ctx)]
            }
        } else {
            return false
        }
    }
}

class ReadFeature2 extends ReadFeature {
    handle() {
        const char = this.ctx.char()

        if (char === /* Some another character */) return false

        this.ctx.ancestor.children.push(/* Another Node */)
        return true
    }
}

const reader = new Reader({
    text: /* Some text */,
    root: /* Output tree */,
    rootFeatures: ctx => [new ReadFeature1(ctx)]
})

const tree = await reader.read()
```

### How To Transform
```js
import { Transformer, TransformFeature } from "str-lang-tool"

class TransformFeature1 extends TransformFeature {
    handle(node) {
        if (this.done) return false /* Release feature after done */

        if (node.type === /* A Node type */) {
            this.ctx.output.children.push(node)
        } else if (node.type === /* Another Node type */) {
            const output = /* A Parent Node */
            this.ctx.output.children.push(output)

            // Feature succession (Let another feature handle nested input)
            return {
                input: node, output,
                features: ctx => [new TransformFeature2(ctx)]
            }
        }

        this.done = true
        return true
    }
}

class TransformFeature2 extends TransformFeature {
    handle(node) {
        // Just push whatever
        this.ctx.output.children.push(node)
    }
}

const transformer = new Transformer({
    inputRoot: /* Input tree */,
    outputRoot: /* Output tree */,
    rootFeatures: ctx => [new TransformFeature1(ctx)]
})

const tree = await transformer.transform()
```

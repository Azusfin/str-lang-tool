/* eslint-disable typescript/no-non-null-assertion */

import type { Literal, Parent, Point } from "unist"
import type {
    ReadFeatureContext, ReadFeatureContextNoData, ReadFeatureContextWithData, ReadFeatureSuccessor
} from ".."
import { Reader, ReadFeature } from ".."

export const numberChars: number[] = [".".codePointAt(0)!]
for (let i = 0; i < 10; i++) {
    numberChars.push(`${i}`.codePointAt(0)!)
}
export const numberCharsLookup = Object.fromEntries(numberChars.map(c => [c, true]))

export const alphabetChars: number[] = []
for (let i = 65; i <= 90; i++) {
    alphabetChars.push(String.fromCodePoint(i).toLowerCase().codePointAt(0)!)
}
export const alphabetCharsLookup = Object.fromEntries(alphabetChars.map(c => [c, true]))

export const operandChars: number[] = [..."+-*/^"].map(c => c.codePointAt(0)!)
export const operandCharsLookup = Object.fromEntries(operandChars.map(c => [c, true]))
export const operandCharsLookupIndex = Object.fromEntries(operandChars.map((c, i) => [c, i]))

export const brackets: [number, number] = [..."()"].map(c => c.codePointAt(0)) as [number, number]

export const enum Operands {
    Add = 0, Sub = 1,
    Multi = 2, Div = 3,
    Exp = 4
}

export type Node = Number | Operand | Name | Bracket

export interface Calculator extends Parent {
    type: "calculator"
    children: Node[]
}

export interface Bracket extends Parent {
    type: "bracket"
    children: Node[]
}

export interface Number extends Literal {
    type: "number"
    value: number
}

export interface Operand extends Literal {
    type: "operand"
    value: Operands
}

export interface Name extends Literal {
    type: "name"
    value: string
}

export class NumberReadFeature extends ReadFeature<Calculator, Calculator | Bracket> {
    protected steps = 0
    protected pointAt = -1
    protected negative = false
    protected startPoint?: Point
    protected codePoints: number[] = []

    public handle(): boolean {
        const codePoint = this.ctx.codePoint()

        if (this.steps === 0 && codePoint === numberChars[0]) {
            if (!this.startPoint) this.codePoints.push(numberChars[1])
            this.codePoints.push(numberChars[0])
            this.pointAt = this.codePoints.length - 1
            this.steps = 1
            if (!this.startPoint) {
                this.startPoint = this.ctx.point()
                if (
                    this.ctx.ancestor.children.length === 1 &&
                    this.ctx.ancestor.children[0].type === "operand" &&
                    this.ctx.ancestor.children[0].value === Operands.Sub
                ) {
                    this.ctx.ancestor.children.length = 0
                    this.negative = true
                }
            }
        } else if (numberCharsLookup[codePoint]) {
            this.codePoints.push(codePoint)
            this.steps = this.steps ? 1 : 0
            if (!this.startPoint) {
                this.startPoint = this.ctx.point()
                if (
                    this.ctx.ancestor.children.length === 1 &&
                    this.ctx.ancestor.children[0].type === "operand" &&
                    this.ctx.ancestor.children[0].value === Operands.Sub
                ) {
                    this.ctx.ancestor.children.length = 0
                    this.negative = true
                }
            }
        } else {
            return false
        }

        return true
    }

    public exit(): void {
        const start = this.startPoint!
        const end = this.ctx.point()

        let num = 0
        let exp = this.pointAt === -1 ? this.codePoints.length - 1 : this.pointAt - 1
        for (const codePoint of this.codePoints) {
            if (codePoint === numberChars[0]) continue
            if (this.negative) num -= (10 ** exp--) * (codePoint - numberChars[1])
            else num += (10 ** exp--) * (codePoint - numberChars[1])
        }

        this.ctx.ancestor.children.push({
            type: "number",
            value: num,
            position: { start, end }
        })
    }
}

export class OperandReadFeature extends ReadFeature<Calculator, Calculator | Bracket> {
    protected done = false
    protected startPoint?: Point

    public handle(): boolean {
        if (this.done) return false

        const codePoint = this.ctx.codePoint()
        if (!operandCharsLookup[codePoint]) return false

        const op: Operands = operandCharsLookupIndex[codePoint]

        this.ctx.ancestor.children.push({
            type: "operand",
            value: op,
            position: {
                start: this.ctx.point(),
                end: this.ctx.point(this.ctx.offset() + 1)
            }
        })

        this.done = true
        return true
    }
}

export class NameReadFeature extends ReadFeature<Calculator, Calculator | Bracket> {
    protected startPoint?: Point
    protected codePoints: number[] = []

    public handle(): boolean {
        const codePoint = this.ctx.codePoint()
        if (!alphabetCharsLookup[codePoint]) return false

        if (!this.startPoint) {
            this.startPoint = this.ctx.point()
        }

        this.codePoints.push(codePoint)

        return true
    }

    public exit(): void {
        const start = this.startPoint!
        const end = this.ctx.point()
        this.ctx.ancestor.children.push({
            type: "name",
            value: String.fromCodePoint(...this.codePoints),
            position: { start, end }
        })
    }
}

export class BracketReadFeature extends ReadFeature<Calculator, Calculator | Bracket> {
    protected started = false
    protected done = false
    protected node?: Bracket
    protected startPoint?: Point

    public handle(): boolean | ReadFeatureSuccessor<Calculator, Calculator | Bracket> {
        if (this.done) return false

        const codePoint = this.ctx.codePoint()
        if (!this.node) {
            if (codePoint !== brackets[0]) return false

            this.started = true
            this.startPoint = this.ctx.point()
            this.node = {
                type: "bracket",
                children: []
            }
            this.node.position = {
                start: this.startPoint,
                end: this.startPoint
            }
            this.ctx.ancestor.children.push(this.node)

            return true
        }

        if (codePoint === brackets[1]) {
            this.done = true
            return true
        }

        return {
            // eslint-disable-next-line typescript/no-use-before-define
            features: getFeatures,
            ancestor: this.node
        }
    }

    public exit(): void {
        if (this.node) {
            this.node.position = {
                start: this.startPoint ?? this.ctx.point(),
                end: this.ctx.point()
            }
        }
    }
}

export type GetFeatures<A extends Parent> =
    (ctx: ReadFeatureContextNoData<ReadFeatureContext<Calculator, A>>) => ReadFeature<Calculator, A>[]

export const getFeatures: GetFeatures<Calculator | Bracket> = pCtx => {
    pCtx.data = {}
    const ctx = pCtx as ReadFeatureContextWithData<typeof pCtx>
    const codePoint = ctx.codePoint()

    if (codePoint === brackets[0]) return [new BracketReadFeature(ctx)]
    else if (operandCharsLookup[codePoint]) return [new OperandReadFeature(ctx)]
    else if (numberCharsLookup[codePoint]) return [new NumberReadFeature(ctx)]
    else if (alphabetCharsLookup[codePoint]) return [new NameReadFeature(ctx)]
    return []
}

export async function read(text: string): Promise<Calculator> {
    const reader = new Reader({
        text,
        rootFeatures: getFeatures as GetFeatures<Calculator>,
        root: {
            type: "calculator",
            children: []
        }
    })

    reader.root.position = {
        start: reader.point(0),
        end: reader.point(text.length)
    }

    return reader.read()
}

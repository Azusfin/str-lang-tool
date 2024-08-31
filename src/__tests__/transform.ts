/* eslint-disable typescript/no-non-null-assertion */
/* eslint-disable typescript/no-use-before-define */

import type { Literal, Parent, Point } from "unist"
import type {
    TransformFeatureContext, TransformFeatureContextNoData,
    TransformFeatureContextWithData, TransformFeatureSuccessor
} from ".."
import { clonePoint, clonePosition, Transformer, TransformFeature } from ".."
import * as Read from "./read"

export const enum OperandLevel {
    AddSub = 0 /* Reserved */,
    MultiDiv = 1,
    Exp = 2
}

export type Node = Read.Number | Read.Operand | OpLevel | Bracket | Function

export interface Calculator extends Parent {
    type: "calculator"
    children: Node[]
}

export interface OpLevel extends Literal, Parent {
    type: "oplevel"
    value: OperandLevel
    children: Node[]
}

export interface Bracket extends Parent {
    type: "bracket"
    children: Node[]
}

export interface Function extends Literal, Parent {
    type: "function"
    value: string
    children: Node[]
}

type IR = Read.Calculator
type IA = Read.Calculator | Read.Bracket
type OR = Calculator
type OA = Calculator | OpLevel | Bracket | Function

export class NumberTransformFeature extends TransformFeature<IR, IA, OR, OA> {
    protected done = false

    public handle(node: Read.Node): boolean {
        if (this.done) return false
        if (node.type !== "number") return false

        const number = { ...node }
        if (number.position) number.position = clonePosition(number.position)
        this.ctx.output.children.push(number)
        this.done = true
        return true
    }
}

export class OperandTransformFeature extends TransformFeature<IR, IA, OR, OA> {
    protected done = false
    protected opLevelDone = false

    protected opLevel?: OpLevel
    protected startPoint?: Point

    public handle(node: Read.Node): boolean | TransformFeatureSuccessor<IR, IA, OR, OpLevel> {
        if (!this.opLevel) {
            if (this.done) return false
            if (node.type !== "operand") return false
            this.done = true
        } else if (this.opLevelDone) {
            return false
        } else if (node.type !== "operand") {
            return {
                output: this.opLevel,
                features: getFeatures as GetFeatures<OpLevel>
            }
        }

        let currentLevel = OperandLevel.AddSub
        if (this.ctx.output.type === "oplevel") {
            currentLevel = this.ctx.output.value
        }

        let currentOpLevel: OperandLevel = currentLevel + 1
        if (this.opLevel) {
            currentOpLevel = this.opLevel.value
        }

        let opLevel = OperandLevel.AddSub
        if (node.value === Read.Operands.Exp /* EXP */) {
            opLevel = OperandLevel.Exp
        } else if (node.value > Read.Operands.Sub /* >SUB */) {
            opLevel = OperandLevel.MultiDiv
        }

        if (currentLevel === opLevel) {
            const operand = { ...node }
            if (operand.position) operand.position = clonePosition(operand.position)
            this.ctx.output.children.push(operand)
            this.opLevelDone = true
            return true
        } else if (currentLevel > opLevel) {
            return false
        } else if (this.opLevel) {
            if (currentOpLevel === opLevel) {
                const operand = { ...node }
                if (operand.position) operand.position = clonePosition(operand.position)
                this.opLevel.children.push(operand)
                return true
            }

            return {
                output: this.opLevel,
                features: getFeatures as GetFeatures<OpLevel>
            }
        }

        const lastNode = this.ctx.output.children.pop()
        this.opLevel = {
            type: "oplevel",
            value: currentOpLevel,
            children: []
        }

        this.ctx.output.children.push(this.opLevel)
        if (lastNode) {
            this.opLevel.children.push(lastNode)
            this.startPoint = lastNode.position?.start
        }

        return {
            output: this.opLevel,
            features: getFeatures as GetFeatures<OpLevel>
        }
    }

    public exit(): void {
        if (this.opLevel) {
            const lastNode = this.opLevel.children.at(-1)!
            const endPoint = lastNode.position?.end
            if (this.startPoint && endPoint) {
                this.opLevel.position = {
                    start: clonePoint(this.startPoint),
                    end: clonePoint(endPoint)
                }
            }
        }
    }
}

export class BracketTransformFeature extends TransformFeature<IR, IA, OR, OA> {
    protected done = false

    public handle(node: Read.Node): boolean | TransformFeatureSuccessor<IR, IA, OR, Bracket> {
        if (this.done) return false
        if (node.type !== "bracket") return false

        const bracket: Bracket = {
            type: "bracket",
            children: []
        }

        if (node.position) bracket.position = clonePosition(node.position)

        this.ctx.output.children.push(bracket)

        return {
            input: node,
            output: bracket,
            features: getFeatures as GetFeatures<Bracket>
        }
    }
}

export class FunctionTransformFeature extends TransformFeature<IR, IA, OR, OA> {
    protected done = false

    protected function?: Function
    protected startPoint?: Point

    public handle(node: Read.Node): boolean | TransformFeatureSuccessor<IR, IA, OR, Function> {
        if (this.done) return false
        if (!this.function) {
            if (node.type !== "name") return false
            this.startPoint = node.position?.start
            this.function = {
                type: "function",
                value: node.value,
                children: []
            }
            this.ctx.output.children.push(this.function)
            return true
        }
        if (node.type !== "bracket") return false

        this.done = true
        const endPoint = node.position?.end

        if (this.startPoint && endPoint) {
            this.function.position = {
                start: clonePoint(this.startPoint),
                end: clonePoint(endPoint)
            }
        }

        return {
            input: node,
            output: this.function,
            features: getFeatures as GetFeatures<Function>
        }
    }
}

export type GetFeatures<A extends Parent> = (
    ctx: TransformFeatureContextNoData<TransformFeatureContext<IR, IA, OR, A>>,
    node: IA["children"][number]
) => TransformFeature<IR, IA, OR, A>[]

export const getFeatures: GetFeatures<OA> = (pCtx, node) => {
    pCtx.data = {}
    const ctx = pCtx as TransformFeatureContextWithData<typeof pCtx>

    // eslint-disable-next-line unicorn/prefer-switch
    if (node.type === "number") return [new NumberTransformFeature(ctx)]
    else if (node.type === "bracket") return [new BracketTransformFeature(ctx)]
    else if (node.type === "name") return [new FunctionTransformFeature(ctx)]
    return [new OperandTransformFeature(ctx)]
}

export async function transform(inputRoot: IR): Promise<Calculator> {
    const transformer = new Transformer({
        inputRoot,
        rootFeatures: getFeatures as GetFeatures<Calculator>,
        outputRoot: {
            type: "calculator",
            children: []
        }
    })

    if (inputRoot.position) transformer.outputRoot.position = clonePosition(inputRoot.position)

    return transformer.transform()
}

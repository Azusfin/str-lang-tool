import type { Literal, Parent, Point } from "unist"
import type {
    TransformFeatureContext, TransformFeatureContextNoData,
    TransformFeatureContextWithData, TransformFeatureSuccessor
} from "../"
import type * as Read from "./read"
import { clonePoint, clonePosition, Transformer, TransformFeature } from "../"

export const enum OPERAND_LEVEL {
    AddSub /* Reserved */,
    MultiDiv,
    Exp
}

export type Node = Read.Number | Read.Operand | OpLevel | Bracket | Function

export interface Calculator extends Parent {
    type: "calculator"
    children: Node[]
}

export interface OpLevel extends Literal, Parent {
    type: "oplevel"
    value: OPERAND_LEVEL
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
                features: <GetFeatures<OpLevel>> getFeatures
            }
        }

        let currentLevel = OPERAND_LEVEL.AddSub
        if (this.ctx.output.type === "oplevel") {
            currentLevel = this.ctx.output.value
        }

        let currentOpLevel = currentLevel+1
        if (this.opLevel) {
            currentOpLevel = this.opLevel.value
        }

        let opLevel = OPERAND_LEVEL.AddSub
        if (node.value === 4 /*EXP*/) {
            opLevel = OPERAND_LEVEL.Exp
        } else if (node.value > 1 /*>SUB*/) {
            opLevel = OPERAND_LEVEL.MultiDiv
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
            } else {
                return {
                    output: this.opLevel,
                    features: <GetFeatures<OpLevel>> getFeatures
                }
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
            features: <GetFeatures<OpLevel>> getFeatures
        }
    }

    public exit(): void {
        if (this.opLevel) {
            const lastNode = this.opLevel.children[this.opLevel.children.length - 1]
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
            features: <GetFeatures<Bracket>> getFeatures
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
            features: <GetFeatures<Function>> getFeatures
        }
    }
}

export type GetFeatures<A extends Parent> = (
        ctx: TransformFeatureContextNoData<TransformFeatureContext<IR, IA, OR, A>>,
        node: IA["children"][number]
    ) => TransformFeature<IR, IA, OR, A>[]

export const getFeatures: GetFeatures<OA> = (pCtx, node) => {
    pCtx.data = {}
    const ctx = <TransformFeatureContextWithData<typeof pCtx>> pCtx

    if (node.type === "number") return [new NumberTransformFeature(ctx)]
    else if (node.type === "bracket") return [new BracketTransformFeature(ctx)]
    else if (node.type === "name") return [new FunctionTransformFeature(ctx)]
    else if (node.type === "operand") return [new OperandTransformFeature(ctx)]
    else return []
}

export function transform(inputRoot: IR): Promise<Calculator> {
    const transformer = new Transformer({
        inputRoot,
        rootFeatures: <GetFeatures<Calculator>> getFeatures,
        outputRoot: {
            type: "calculator",
            children: []
        }
    })

    if (inputRoot.position) transformer.outputRoot.position = clonePosition(inputRoot.position)

    return transformer.transform()
}

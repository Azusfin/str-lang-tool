import { inspect } from "util"
import type { TransformFeatureFactory, Block, BlockWithT, BlockNested, BlockScalar } from "../"
import { Transformer, TransformFeature, TransformError, BlockType } from "../"
import { numberFeatureSymbol, nameFeatureSymbol, operandFeatureSymbol, bracketFeatureSymbol, blocks } from "./read"

type OP = "+" | "-" | "*" | "/" | "^"

const enum OPERAND_LEVEL {
    ADD_SUB,
    MULTI_DIV,
    EXPONENT
}

function getOperandLevel(op: OP): OPERAND_LEVEL {
    if (op === "^") return OPERAND_LEVEL.EXPONENT
    else if (op === "*" || op === "/") return OPERAND_LEVEL.MULTI_DIV
    else return OPERAND_LEVEL.ADD_SUB
}

interface BaseNode {
    from: number
    to: number
}

interface NumberNode extends BaseNode {
    type: "num"
    num: number
}

interface OperandNode extends BaseNode {
    type: "op"
    op: OP
}

interface OpLevelNode extends BaseNode {
    type: "oplevel"
    level: OPERAND_LEVEL
    val: Node[]
}

interface BracketNode extends BaseNode {
    type: "bracket"
    val: Node[]
}

interface FunctionNode extends BaseNode {
    type: "func"
    name: string
    val: Node[]
}

type Node = NumberNode | OperandNode | OpLevelNode | BracketNode | FunctionNode

const functionFeatureSymbol = Symbol("FUNCTION")
class FunctionTransformFeature extends TransformFeature<Node> {
    protected steps = 0

    protected claim(block: Block): boolean {
        let bool = false
        if (this.steps === 0 && block.type === BlockType.SCALAR && block.symbol === nameFeatureSymbol) bool = true
        if (this.steps === 1 && block.type === BlockType.NEST && block.symbol === bracketFeatureSymbol) bool = true
        if (this.steps >= 2) return false

        if (!bool) throw new TransformError("Unexpected block on function transform feature")

        this.steps++
        return bool
    }

    public handle(blocks: BlockWithT<Node>[]): void {
        const funcNode: FunctionNode = {
            type: "func",
            name: blocks[0].value as string,
            val: blocks[1].value as Node[],
            from: blocks[0].from,
            to: blocks[1].to
        }

        this.transformer.add(funcNode)
    }
}

const opLevelFeatureSymbol = Symbol("OPLEVEL")
type OperandTransformFeatureFactory = (transformer: Transformer<Node>) => OperandTransformFeature
abstract class OperandTransformFeature extends TransformFeature<Node> {
    protected abstract level: OPERAND_LEVEL
    protected abstract factory: OperandTransformFeatureFactory

    protected block?: BlockNested<Node>
    protected prevVal?: BlockWithT<Node>

    public setInitialVal(val: BlockWithT<Node>): void {
        if (this.blocks.length !== 0) throw new TransformError("Tried to set initial val not on first")
        this.prevVal = val
        this.blocks.push(val)
    }

    protected claim(block: Block): boolean {
        if (this.block) this.handleBlockDone()
        if (block.type === BlockType.DEFAULT) throw new TransformError("Unexpected character block")
        if (block.type === BlockType.SCALAR) {
            if (block.symbol === nameFeatureSymbol) {
                this.handleBlockStart(block)
            } else if (block.symbol === operandFeatureSymbol) {
                if (getOperandLevel(block.value as OP) < this.level) {
                    if (this.level === OPERAND_LEVEL.ADD_SUB) {
                        throw new TransformError("Tried to go to a level shallower than add sub")
                    }
                    return false
                } else if (getOperandLevel(block.value as OP) > this.level) {
                    this.handleBlockStart(block)
                }
            }
        }

        return true
    }

    protected handle(blocks: BlockWithT<Node>[]): void {
        if (this.block) this.handleBlockDone()

        for (const block of blocks) {
            if (block.type === BlockType.SCALAR) {
                if (block.symbol === numberFeatureSymbol) {
                    const numNode: NumberNode = {
                        type: "num",
                        num: Number(block.value),
                        from: block.from,
                        to: block.to
                    }
                    this.transformer.add(numNode)
                } else {
                    const opNode: OperandNode = {
                        type: "op",
                        op: block.value as OP,
                        from: block.from,
                        to: block.to
                    }
                    this.transformer.add(opNode)
                }
            } else if (block.type === BlockType.NEST) {
                if (block.symbol === functionFeatureSymbol) {
                    this.transformer.add(block.value[0])
                } else if (block.symbol === opLevelFeatureSymbol) {
                    const opLevelNode: OpLevelNode = {
                        type: "oplevel",
                        level: this.level+1,
                        val: block.value,
                        from: block.from,
                        to: block.to
                    }
                    this.transformer.add(opLevelNode)
                } else {
                    const bracketNode: BracketNode = {
                        type: "bracket",
                        val: block.value,
                        from: block.from,
                        to: block.to
                    }
                    this.transformer.add(bracketNode)
                }
            }
        }
    }

    protected handleBlock(block: Block): void {
        const isOperand = block.type === BlockType.SCALAR && block.symbol === operandFeatureSymbol
        if (isOperand && this.block) return

        if (this.block) this.blocks.push(this.block)
        else super.handleBlock(block)

        if (isOperand) return

        this.prevVal = this.blocks[this.blocks.length - 1]
    }

    protected handleBlockStart(block: Block): void {
        const outputWindow: Node[] = []

        if (block.type === BlockType.SCALAR && block.symbol === nameFeatureSymbol) {
            this.block = {
                type: BlockType.NEST,
                value: outputWindow,
                symbol: functionFeatureSymbol,
                from: block.from,
                to: 0
            }

            this.formerOutputWindow = this.transformer.getOutputWindow()
            this.transformer.setOutputWindow(outputWindow)

            this.transformer.handleFactories([t => new FunctionTransformFeature(t)], block)
        } else {
            this.block = {
                type: BlockType.NEST,
                value: outputWindow,
                symbol: opLevelFeatureSymbol,
                from: this.prevVal!.from,
                to: 0
            }

            this.formerOutputWindow = this.transformer.getOutputWindow()
            this.transformer.setOutputWindow(outputWindow)

            const factory: OperandTransformFeatureFactory = () => {
                const feature = this.factory(this.transformer)
                feature.setInitialVal(this.prevVal!)
                return feature
            }

            this.transformer.handleFactories([factory], block)

            this.blocks.pop()
            this.blocks.push(this.block)
            this.prevVal = this.block
        }
    }

    protected handleBlockDone(): void {
        this.transformer.setOutputWindow(this.formerOutputWindow)
        this.block!.to = this.block!.value[this.block!.value.length - 1].to
        delete this.formerOutputWindow
        delete this.block
    }
}

class ExponentTransformFeature extends OperandTransformFeature {
    protected level: OPERAND_LEVEL = OPERAND_LEVEL.EXPONENT
    protected factory: OperandTransformFeatureFactory = () => { throw new TransformError("Tried to go a level deeper than exponent") }
}

class MultiDivTransformFeature extends OperandTransformFeature {
    protected level: OPERAND_LEVEL = OPERAND_LEVEL.MULTI_DIV
    protected factory: OperandTransformFeatureFactory = t => new ExponentTransformFeature(t)
}

class AddSubTransformFeature extends OperandTransformFeature {
    protected level: OPERAND_LEVEL = OPERAND_LEVEL.ADD_SUB
    protected factory: OperandTransformFeatureFactory = t => new MultiDivTransformFeature(t)
}

export const factories: TransformFeatureFactory<Node>[] = [
    (transformer: Transformer<Node>) => new AddSubTransformFeature(transformer)
]

const transformer = new Transformer<Node>({ blocks, factories })
const nodes = transformer.transform()

console.log("Transformer")
console.log(inspect(nodes, { depth: Infinity }))

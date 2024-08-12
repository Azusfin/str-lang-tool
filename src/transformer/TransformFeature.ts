import type { Block, BlockWithT, BlockNested } from "../blocks"
import type { Transformer } from "."
import { BlockType } from "../blocks"

export abstract class TransformFeature<T = Block> {
    protected transformer: Transformer<T>
    protected blocks: BlockWithT<T>[] = []

    public handlingNest = false
    protected formerIndex?: number
    protected formerInputWindow?: Block[]
    protected formerOutputWindow?: T[]

    public constructor(transformer: Transformer<T>) {
        this.transformer = transformer
    }

    public accept(block: Block): boolean {
        const claimed = this.claim(block)

        if (claimed) {
            this.handleBlock(block)
            return true
        }

        return false
    }

    public next(block: Block): void {
        const claimed = this.claim(block)

        if (claimed) {
            this.handleBlock(block)
        } else {
            this.transformer.rollback()
            this.transformer.release(this)
        }
    }

    public handleRelease(): void {
        this.handle(this.blocks)
    }

    public handleNest(block: Block): void {
        const factories = this.transformer.getFactories()
        this.transformer.handleFactories(factories, block)
    }

    public handleNestDone(): void {
        this.transformer.setIndex(this.formerIndex!)
        this.transformer.setInputWindow(this.formerInputWindow)
        this.transformer.setOutputWindow(this.formerOutputWindow)

        this.handlingNest = false
        delete this.formerIndex
        delete this.formerInputWindow
        delete this.formerOutputWindow
    }

    protected handleBlock(block: Block): void {
        if (block.type === BlockType.NEST) {
            this.handlingNest = true
            this.blocks.push(this.handleBlockNested(block))
        } else {
            this.blocks.push(block)
        }
    }

    protected handleBlockNested(block: BlockNested): BlockNested<T> {
        const newBlock: BlockNested<T> = {
            type: BlockType.NEST,
            value: [],
            symbol: block.symbol,
            from: block.from,
            to: block.to
        }

        this.formerIndex = this.transformer.getIndex()
        this.formerInputWindow = this.transformer.getInputWindow()
        this.formerOutputWindow = this.transformer.getOutputWindow()

        this.transformer.setIndex(0)
        this.transformer.setInputWindow(block.value)
        this.transformer.setOutputWindow(newBlock.value)

        this.handleNest(this.transformer.getBlock(0))

        return newBlock
    }

    protected abstract claim(block: Block): boolean
    protected abstract handle(blocks: BlockWithT<T>[]): void
}

export type TransformFeatureFactory<T = Block> = (transformer: Transformer<T>) => TransformFeature<T>

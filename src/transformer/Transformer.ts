import type { Block } from "../blocks"
import type { TransformFeature, TransformFeatureFactory } from "."

export class TransformError extends Error {
    public name: string = "TransformError"
}

export interface TransformerOptions<T = Block> {
    blocks: Block[]
    factories: TransformFeatureFactory<T>[]
}

export class Transformer<T = Block> {
    protected blocks: Block[]
    protected factories: TransformFeatureFactory<T>[]
    protected features: TransformFeature<T>[] = []
    protected output: T[] = []
    protected index = 0
    protected hasTransformed = false

    protected inputWindow?: Block[]
    protected outputWindow?: T[]

    public constructor(options: TransformerOptions<T>) {
        this.blocks = options.blocks
        this.factories = options.factories
    }

    public transform(): T[] {
        if (!this.hasTransformed) {
            this.doTransform()
        }

        return this.output
    }

    public rollback(steps: number = 1): void {
        const stepsToRollback = Math.min(steps, this.index)
        this.index -= stepsToRollback
    }

    public jump(steps: number = 1): void {
        const stepsToJump = Math.min(steps, this.getBlocks().length - this.index)
        this.index += stepsToJump
    }

    public release(instance: TransformFeature<T>): void {
        if (this.features.length <= 0) throw new TransformError("No feature to be released")
        const feature = this.features.pop()
        if (instance !== feature) throw new TransformError("Illegal feature release call")
        feature.handleRelease()
    }

    public add(item: T): void {
        const window = this.outputWindow ?? this.output
        window.push(item)
    }

    public getBlocks(): Block[] {
        return this.inputWindow ?? this.blocks
    }

    public getBlock(index: number): Block {
        return this.getBlocks()[index]
    }

    public getIndex(): number {
        return this.index
    }

    public setIndex(index: number): void {
        this.index = index
    }

    public getInputWindow(): Block[] | undefined {
        return this.inputWindow
    }

    public setInputWindow(window: Block[] | undefined): void {
        this.inputWindow = window
    }

    public getOutputWindow(): T[] | undefined {
        return this.outputWindow
    }

    public setOutputWindow(window: T[] | undefined) {
        this.outputWindow = window
    }

    public getFactories(): TransformFeatureFactory<T>[] {
        return this.factories
    }

    public handleFactories(factories: TransformFeatureFactory<T>[], block: Block): void {
        for (const factory of factories) {
            const feature = factory(this)
            const formerFeaturesLength = this.features.length
            this.features.push(feature)

            const accepted = feature.accept(block)
            if (!accepted) {
                this.features.length = formerFeaturesLength
            } else {
                return
            }
        }
    }

    protected doTransform(): void {
        while (!this.hasTransformed) {
            this.next()
        }
    }

    protected next(): void {
        const index = this.getIndex()
        const blocks = this.getBlocks()

        if (index == blocks.length) {
            for (let i = this.features.length; i > 0; i--) {
                const feature = this.features[i-1]

                if (feature.handlingNest) {
                    feature.handleNestDone()
                    this.jump()
                    return
                }

                this.release(feature)
            }

            this.hasTransformed = true

            return
        }

        const block = blocks[index]

        if (this.features.length === 0) {
            this.handleFactories(this.getFactories(), block)
        } else {
            const feature = this.features[this.features.length - 1]

            if (feature.handlingNest) {
                feature.handleNest(block)
            } else {
                feature.next(block)
            }
        }

        this.jump()
    }
}

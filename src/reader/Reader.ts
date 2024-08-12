import type { ReadFeature, ReadFeatureFactory } from "."
import type { Block, BlockDefault } from "../blocks"
import { ReadError } from "."
import { BlockType } from "../blocks"

export interface ReaderOptions {
    text: string
    factories: ReadFeatureFactory[]
}

export class Reader {
    protected text: string
    protected factories: ReadFeatureFactory[]
    protected features: ReadFeature[] = []
    protected blocks: Block[] = []
    protected position = 0
    protected hasRead = false

    protected blocksWindow?: Block[]

    public constructor(options: ReaderOptions) {
        this.text = options.text
        this.factories = options.factories
    }

    public read(): Block[] {
        if (!this.hasRead) {
            this.doRead()
            this.hasRead = true
        }

        return this.blocks
    }

    public rollback(steps: number = 1): void {
        const stepsToRollback = Math.min(steps, this.position)
        this.position -= stepsToRollback
    }

    public jump(steps: number = 1): void {
        const stepsToJump = Math.min(steps, this.text.length - this.position)
        this.position += stepsToJump
    }

    public release(instance: ReadFeature): void {
        if (this.features.length <= 0) throw new ReadError("No feature to be released", this.position)
        const feature = this.features.pop()
        if (instance !== feature) throw new ReadError("Illegal feature release call", this.position)
        feature.handleRelease()
    }

    public addBlock(block: Block): void {
        const window = this.blocksWindow ?? this.blocks
        window.push(block)
    }

    public getPos(): number {
        return this.position
    }

    public getWindow(): Block[] | undefined {
        return this.blocksWindow
    }

    public setWindow(window: Block[] | undefined) {
        this.blocksWindow = window
    }

    public handleFactories(factories: ReadFeatureFactory[], char: string, pos: number): void {
        for (const factory of factories) {
            const feature = factory(this)
            const accepted = feature.accept(char, pos)

            if (accepted) {
                this.features.push(feature)
                feature.next(char, pos)
                return
            }
        }

        const defaultBlock: BlockDefault = {
            type: BlockType.DEFAULT,
            value: char,
            from: this.position,
            to: this.position
        }

        this.addBlock(defaultBlock)
    }

    protected doRead(): void {
        while (this.position < this.text.length) {
            this.next()
        }

        for (let i = this.features.length; i > 0; i--) {
            const feature = this.features[i-1]
            this.release(feature)
        }
    }

    protected next(): void {
        const pos = this.position
        const char = this.text[this.position]

        if (this.features.length === 0) {
            this.handleFactories(this.factories, char, pos)
        } else {
            const feature = this.features[this.features.length - 1]
            feature.next(char, pos)
        }

        this.jump()
    }
}

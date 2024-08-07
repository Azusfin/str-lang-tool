import type { Reader } from "."
import type { Block, BlockNested } from "../blocks"
import { BlockType } from "../blocks"

export abstract class BaseReadFeature {
    protected reader: Reader

    public constructor(reader: Reader) {
        this.reader = reader
    }

    protected release(): void {
        this.reader.release(this)
    }

    /** How should the feature handle release event */
    public abstract handleRelease(): void

    /** How should the feature handle every character */
    public abstract next(char: string, pos: number): void

    /** How should the feature handle first character */
    public abstract claim(char: string, pos: number): boolean
}

export abstract class ScalarReadFeature extends BaseReadFeature {
    protected symbol: symbol
    protected starterChars: string[]
    protected value: string = ""
    protected startPos: number = 0

    public constructor(reader: Reader, symbol: symbol, starterChars: string[]) {
        super(reader)
        this.symbol = symbol
        this.starterChars = starterChars
    }

    /** How should the scalar feature handle every character */
    public abstract handleNext(char: string, pos: number): string | undefined

    public claim(char: string, pos: number): boolean {
        if (this.starterChars.includes(char)) {
            this.startPos = pos
            return true
        }
        return false
    }

    public next(char: string, pos: number): void {
        const handledChar = this.handleNext(char, pos)
        if (handledChar === undefined) this.release()
        else this.value += handledChar
    }

    public handleRelease(): void {
        this.reader.rollback()
        this.reader.addBlock({
            type: BlockType.SCALAR,
            value: this.value,
            symbol: this.symbol,
            from: this.startPos,
            to: this.reader.getPos()
        })
    }
}

export class NestedReadFeature extends BaseReadFeature {
    protected symbol: symbol
    protected brackets: [string, string]
    protected factories: ReadFeatureFactory[]

    protected startWindow?: Block[]
    protected block: BlockNested

    public constructor(reader: Reader, symbol: symbol, brackets: [string, string], factories: ReadFeatureFactory[]) {
        super(reader)
        this.symbol = symbol
        this.brackets = brackets
        this.factories = factories
        this.block = {
            type: BlockType.NEST,
            value: [],
            symbol: this.symbol,
            from: 0,
            to: 0
        }
    }

    public claim(char: string, pos: number): boolean {
        if (char === this.brackets[0]) {
            this.block.from = pos
            this.startWindow = this.reader.getWindow()
            this.reader.addBlock(this.block)
            this.reader.setWindow(this.block.value)
            return true
        }
        return false
    }

    public next(char: string, pos: number): void {
        if (pos === this.block.from) return
        if (char === this.brackets[1]) this.release()
        else this.reader.handleFactories(this.factories, char, pos)
    }

    public handleRelease(): void {
        this.block.to = this.reader.getPos()
        this.reader.setWindow(this.startWindow)
    }
}

export type ReadFeature = BaseReadFeature
export type ReadFeatureFactory = (reader: Reader) => ReadFeature

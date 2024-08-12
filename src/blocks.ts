export const enum BlockType {
    DEFAULT = "character",
    SCALAR = "scalar",
    NEST = "nested"
}

interface BaseBlock {
    from: number
    to: number
}

export interface BlockDefault extends BaseBlock {
    type: BlockType.DEFAULT
    value: string
}

export interface BlockScalar extends BaseBlock {
    type: BlockType.SCALAR
    value: string
    symbol: symbol
}

export interface BlockNested<T = Block> extends BaseBlock {
    type: BlockType.NEST
    value: T[]
    symbol: symbol
}

export type Block = BlockDefault | BlockScalar | BlockNested
export type BlockWithT<T> = BlockDefault | BlockScalar | BlockNested<T>

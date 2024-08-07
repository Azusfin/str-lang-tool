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

export interface BlockNested extends BaseBlock {
    type: BlockType.NEST
    value: Block[]
    symbol: symbol
}

export type Block = BlockDefault | BlockScalar | BlockNested

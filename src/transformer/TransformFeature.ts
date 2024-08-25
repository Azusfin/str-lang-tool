import type { Parent } from "unist"

export interface TransformFeatureContext<
    IR extends Parent, IA extends Parent,
    OR extends Parent, OA extends Parent,
    D = Record<string, unknown>
> {
    inputRoot: IR
    input: IA
    outputRoot: OR
    output: OA
    data: D
    index(): number
    length(): number
    node(): IA["children"][number]
    node(index?: number): IA["children"][number] | undefined
}

export type TransformFeatureContextNoData<
    C extends TransformFeatureContext<Parent, Parent, Parent, Parent>
> = Omit<C, "data"> & Partial<Pick<C, "data">>

export type TransformFeatureContextWithData<
    C extends TransformFeatureContextNoData<TransformFeatureContext<Parent, Parent, Parent, Parent>>
> = Omit<C, "data"> & Required<Pick<C, "data">>

export interface TransformFeatureSuccessor<
    IR extends Parent, IA extends Parent,
    OR extends Parent, OA extends Parent,
    D = Record<string, unknown>
> {
    features(ctx: TransformFeatureContextNoData<
        TransformFeatureContext<IR, IA, OR, OA>
    >, node: IA["children"][number]): TransformFeature<IR, IA, OR, OA, D>[]
    input?: IA
    output?: OA
}

export abstract class TransformFeature<
    IR extends Parent, IA extends Parent,
    OR extends Parent, OA extends Parent,
    D = Record<string, unknown>
> {
    public constructor(public readonly ctx: TransformFeatureContext<IR, IA, OR, OA, D>) {}

    public exit(): Promise<void> | void {}
    public abstract handle(node: IA["children"][number]): (
        Promise<boolean | TransformFeatureSuccessor<IR, Parent, OR, Parent>> |
        boolean | TransformFeatureSuccessor<IR, Parent, OR, Parent>
    )
}

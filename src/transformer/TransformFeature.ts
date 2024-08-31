import type { Parent, Node } from "unist"

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

// Allow for either sync / async method on transform feature
export abstract class TransformFeature<
    IR extends Parent, IA extends Parent,
    OR extends Parent, OA extends Parent,
    D = Record<string, unknown>
> {
    constructor(public ctx: TransformFeatureContext<IR, IA, OR, OA, D>) {}

    // Handle feature on exiting (release)
    // eslint-disable-next-line typescript/no-empty-function
    public exit(): Promise<void> | void {}

    // Handler of the feature on current character
    public abstract handle(node: IA["children"][number]): (
        Promise<boolean | TransformFeatureSuccessor<IR, Parent, OR, Parent>> |
        boolean | TransformFeatureSuccessor<IR, Parent, OR, Parent>
    )
}

// Transform feature to handle input change
export class TransformerNestedInputHandler<
    IR extends Parent, OR extends Parent
> extends TransformFeature<IR, Parent, OR, Parent> {
    constructor(
        ctx: TransformFeatureContext<IR, Parent, OR, Parent>,
        public readonly features: (ctx: TransformFeatureContextNoData<
            TransformFeatureContext<IR, Parent, OR, Parent>
        >, node: Node) => TransformFeature<IR, Parent, OR, Parent>[]
    ) { super(ctx) }

    public handle(): TransformFeatureSuccessor<IR, Parent, OR, Parent> {
        return { features: this.features }
    }
}

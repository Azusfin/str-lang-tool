import type { Parent, Point } from "unist"

export interface ReadFeatureContext<R extends Parent, A extends Parent, D = Record<string, unknown>> {
    root: R
    ancestor: A
    data: D
    offset(): number
    length(): number
    point(offset?: number): Point
    char(): string
    char(offset?: number): string | undefined
    codePoint(): number
    codePoint(offset?: number): number| undefined
}

export type ReadFeatureContextNoData<C extends ReadFeatureContext<Parent, Parent>>
    = Omit<C, "data"> & Partial<Pick<C, "data">>

export type ReadFeatureContextWithData<C extends ReadFeatureContextNoData<ReadFeatureContext<Parent, Parent>>>
    = Omit<C, "data"> & Required<Pick<C, "data">>

export interface ReadFeatureSuccessor<R extends Parent, A extends Parent, D = Record<string, unknown>> {
    features(ctx: ReadFeatureContextNoData<ReadFeatureContext<R, A>>): ReadFeature<R, A, D>[]
    ancestor?: A
}

export abstract class ReadFeature<R extends Parent, A extends Parent, D = Record<string, unknown>> {
    public constructor(public readonly ctx: ReadFeatureContext<R, A, D>) {}

    public exit(): Promise<void> | void {}
    public abstract handle(): (
        Promise<boolean | ReadFeatureSuccessor<R, Parent>> |
        boolean | ReadFeatureSuccessor<R, Parent>
    )
}

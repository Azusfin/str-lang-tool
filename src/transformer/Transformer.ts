import type { Node, Parent, Point, Position } from "unist"
import type {
    TransformFeatureContext, TransformFeatureContextNoData,
    TransformFeatureContextWithData, TransformFeatureSuccessor
} from "."
import { TransformFeature } from "./TransformFeature"

export interface TransformerOptions<IR extends Parent, OR extends Parent> {
    inputRoot: IR
    outputRoot: OR
    rootFeatures(
        ctx: TransformFeatureContextNoData<TransformFeatureContext<IR, IR, OR, OR>>,
        node: IR["children"][number]
    ): TransformFeature<IR, IR, OR, OR>[]
}

export class Transformer<IR extends Parent, OR extends Parent> {
    public readonly inputRoot: IR
    public readonly outputRoot: OR

    public rootFeatures: (
        ctx: TransformFeatureContextNoData<TransformFeatureContext<IR, IR, OR, OR>>,
        node: IR["children"][number]
    ) => TransformFeature<IR, IR, OR, OR>[]

    public hasTransformed = false

    protected indexes: WeakMap<Parent, number> = new WeakMap()
    protected features: TransformFeature<IR, Parent, OR, Parent>[] = []

    public constructor(options: TransformerOptions<IR, OR>) {
        this.inputRoot = options.inputRoot
        this.outputRoot = options.outputRoot
        this.rootFeatures = options.rootFeatures
        this.indexes.set(this.inputRoot, 0)
    }

    public get indexRoot(): number {
        return this.indexes.get(this.inputRoot)!
    }

    public transform(): Promise<OR> {
        if (!this.hasTransformed) {
            return this.iterate().then(() => this.outputRoot)
        }
        return Promise.resolve(this.outputRoot)
    }

    protected context<IA extends Parent, OA extends Parent>(input: IA, output: OA)
        : TransformFeatureContextNoData<TransformFeatureContext<IR, IA, OR, OA>> {
        return {
            inputRoot: this.inputRoot,
            input: input,
            outputRoot: this.outputRoot,
            output: output,
            index: () => this.indexes.get(input) ?? 0,
            length: () => input.children.length,
            node: (index: number = this.indexes.get(input) ?? 0) => {
                return input.children[index]
            }
        }
    }

    protected release(): (
        Promise<TransformFeature<IR, Parent, OR, Parent> | undefined> |
        TransformFeature<IR, Parent, OR, Parent> | undefined
     ) {
        const feature = this.features.pop()
        const promise = feature?.exit()

        if (promise instanceof Promise) {
            return promise.then(() => {
                const lastFeature = this.features[this.features.length - 1]
                if (feature && lastFeature && feature.ctx.input !== lastFeature.ctx.input) {
                    this.indexes.delete(feature.ctx.input)
                    this.indexes.set(lastFeature.ctx.input, lastFeature.ctx.index()+1)
                }

                return lastFeature
            })
        }

        const lastFeature = this.features[this.features.length - 1]
        if (feature && lastFeature && feature.ctx.input !== lastFeature.ctx.input) {
            this.indexes.delete(feature.ctx.input)
            this.indexes.set(lastFeature.ctx.input, lastFeature.ctx.index()+1)
        }

        return lastFeature
    }

    protected async iterate(): Promise<void> {
        let currentFeature: TransformFeature<IR, Parent, OR, Parent> | undefined
        let currentInput: Parent = this.inputRoot
        let currentLength = currentInput.children.length
        let currentNode = this.inputRoot.children[0]
        let currentIndex = 0

        while (!this.hasTransformed) {
            if (currentIndex >= currentLength) {
                for (let i = this.features.length; i > 0; i--) {
                    const feature = this.features[i-1]

                    if (feature.ctx.input !== currentInput) {
                        currentFeature = feature
                        currentInput = feature.ctx.input
                        currentLength = currentInput.children.length
                        currentIndex = this.indexes.get(currentInput) ?? 0
                        currentNode = currentInput.children[currentIndex]

                        break
                    }

                    const promise = this.release()
                    if (promise instanceof Promise) await promise
                }

                if (!this.features.length) this.hasTransformed = true

                continue
            }

            let feature: TransformFeature<IR, Parent, OR, Parent> | undefined = currentFeature
            let features: TransformFeature<IR, Parent, OR, Parent>[] | undefined

            if (!feature) {
                features = this.rootFeatures(this.context(this.inputRoot, this.outputRoot), currentNode)
            }

            while (feature || features) {
                if (feature) {
                    const resPromise = feature.handle(currentNode)
                    const res = resPromise instanceof Promise ? await resPromise : resPromise

                    if (typeof res === "boolean") {
                        if (!res) {
                            const releasePromise = this.release()
                            feature = (
                                releasePromise instanceof Promise ? await releasePromise : releasePromise
                            )

                            features = undefined

                            if (!feature) {
                                features = this.rootFeatures(
                                    this.context(this.inputRoot, this.outputRoot), currentNode
                                )

                                currentFeature = undefined
                                currentInput = this.inputRoot
                            } else {
                                currentFeature = feature
                                currentInput = feature.ctx.input
                            }

                            currentIndex = this.indexes.get(currentInput) ?? 0
                            currentNode = currentInput.children[currentIndex]

                            continue
                        }

                        feature = undefined
                        features = undefined
                    } else {
                        const input = res.input ?? feature.ctx.input
                        const output = res.output ?? feature.ctx.output

                        if (input !== feature.ctx.input) {
                            const pCtx = this.context(input, output)
                            pCtx.data = {}
                            const ctx = <TransformFeatureContextWithData<typeof pCtx>> pCtx

                            feature = new TransformerNestedInputHandler(ctx, res.features)
                            features = undefined

                            this.features.push(feature)

                            currentFeature = feature
                            currentInput = input
                            currentIndex = 0
                            currentNode = input.children[0]
                        } else {
                            feature = undefined
                            features = res.features(this.context(input, output), currentNode)
                        }
                    }
                } else if (features) {
                    if (!features.length) {
                        feature = undefined
                        features = undefined
                        continue
                    }

                    let res: boolean | TransformFeatureSuccessor<IR, Parent, OR, Parent> = false

                    for (feature of features) {
                        const resPromise = feature.handle(currentNode)
                        res = resPromise instanceof Promise ? await resPromise : resPromise
                        if (res) break
                    }

                    if (feature && res) {
                        this.features.push(feature)
                        if (typeof res !== "boolean") {
                            const input = res.input ?? feature.ctx.input
                            const output = res.output ?? feature.ctx.output

                            if (input !== feature.ctx.input) {
                                const pCtx = this.context(input, output)
                                pCtx.data = {}
                                const ctx = <TransformFeatureContextWithData<typeof pCtx>> pCtx

                                feature = new TransformerNestedInputHandler(ctx, res.features)
                                this.features.push(feature)

                                features = undefined

                                currentFeature = feature
                                currentInput = input
                                currentIndex = 0
                                currentNode = input.children[0]
                            } else {
                                features = res.features(this.context(input, output), currentNode)
                                feature = undefined
                            }
                        } else {
                            currentFeature = feature
                            feature = undefined
                            features = undefined
                        }
                    } else {
                        feature = undefined
                        features = undefined
                    }
                }
            }

            currentLength = currentInput.children.length
            currentNode = currentInput.children[++currentIndex]
            this.indexes.set(currentInput, currentIndex)
        }
    }
}

export class TransformerNestedInputHandler<
    IR extends Parent, OR extends Parent
> extends TransformFeature<IR, Parent, OR, Parent> {
    public constructor(
        ctx: TransformFeatureContext<IR, Parent, OR, Parent>,
        public readonly features: (ctx: TransformFeatureContextNoData<
            TransformFeatureContext<IR, Parent, OR, Parent>
        >, node: Node) => TransformFeature<IR, Parent, OR, Parent>[]
    ) { super(ctx) }

    public handle(_: Node): TransformFeatureSuccessor<IR, Parent, OR, Parent> {
        return { features: this.features }
    }
}

export function clonePoint(input: Point): Point {
    return {
        line: input.line,
        column: input.column,
        offset: input.offset
    }
}

export function clonePosition(input: Position): Position {
    return {
        start: clonePoint(input.start),
        end: clonePoint(input.end)
    }
}

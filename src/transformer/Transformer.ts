/* eslint-disable promise/prefer-await-to-then */
/* eslint-disable typescript/strict-boolean-expressions */
/* eslint-disable no-await-in-loop */
/* eslint-disable typescript/no-non-null-assertion */

import type { Parent, Point, Position } from "unist"

import { TransformerNestedInputHandler } from "./TransformFeature"
import type {
    TransformFeature,
    TransformFeatureContext, TransformFeatureContextNoData,
    TransformFeatureContextWithData, TransformFeatureSuccessor
} from "."

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

    protected indexes: WeakMap<Parent, number> = new WeakMap<Parent, number>()
    protected features: TransformFeature<IR, Parent, OR, Parent>[] = []

    constructor(options: TransformerOptions<IR, OR>) {
        this.inputRoot = options.inputRoot
        this.outputRoot = options.outputRoot

        // eslint-disable-next-line typescript/unbound-method
        this.rootFeatures = options.rootFeatures

        this.indexes.set(this.inputRoot, 0)
    }

    public get indexRoot(): number {
        return this.indexes.get(this.inputRoot) ?? 0
    }

    public async transform(): Promise<OR> {
        if (!this.hasTransformed) await this.iterate()
        return this.outputRoot
    }

    protected context<IA extends Parent, OA extends Parent>(input: IA, output: OA):
    TransformFeatureContextNoData<TransformFeatureContext<IR, IA, OR, OA>> {
        return {
            inputRoot: this.inputRoot,
            input,
            outputRoot: this.outputRoot,
            output,
            index: () => this.indexes.get(input) ?? 0,
            length: () => input.children.length,
            node: (index: number = this.indexes.get(input) ?? 0) => input.children[index]
        }
    }

    protected release(): (
        Promise<TransformFeature<IR, Parent, OR, Parent> | undefined> |
        TransformFeature<IR, Parent, OR, Parent> | undefined
    ) {
        const feature = this.features.pop()
        const exitPromise = feature?.exit()

        const handleRelease = (): TransformFeature<IR, Parent, OR, Parent> | undefined => {
            const lastFeature = this.features.at(-1)
            if (feature && lastFeature && feature.ctx.input !== lastFeature.ctx.input) {
                this.indexes.delete(feature.ctx.input)
                this.indexes.set(lastFeature.ctx.input, lastFeature.ctx.index() + 1)
            }

            return lastFeature
        }

        if (exitPromise instanceof Promise) {
            return exitPromise.then(handleRelease)
        }

        return handleRelease()
    }

    protected async iterate(): Promise<void> {
        let input: Parent = this.inputRoot
        let length = input.children.length
        let index = this.indexes.get(this.inputRoot)!
        let node = input.children[index]

        let feature: TransformFeature<IR, Parent, OR, Parent> | undefined
        let features: TransformFeature<IR, Parent, OR, Parent>[] | undefined
        features = this.rootFeatures(this.context(this.inputRoot, this.outputRoot), node)

        // Ensure the input components
        const ensureInput = (newInput: Parent): void => {
            if (input === newInput) return

            input = newInput
            length = input.children.length
            index = this.indexes.get(input) ?? 0
            node = input.children[index]
        }

        // Handle feature releasing
        const handleRelease = (tFeature: TransformFeature<IR, Parent, OR, Parent> | undefined): false => {
            feature = tFeature

            ensureInput(feature?.ctx.input ?? this.inputRoot)

            if (!feature) {
                features = this.rootFeatures(this.context(this.inputRoot, this.outputRoot), node)
            }

            return false
        }

        // Handle result from feature handle
        const handleRes = (res: boolean | TransformFeatureSuccessor<IR, Parent, OR, Parent>): (
            Promise<boolean> | boolean
        ) => {
            if (typeof res === "boolean") {
                features = undefined

                if (!res) {
                    const releasePromise = this.release()

                    if (releasePromise instanceof Promise) {
                        return releasePromise.then(handleRelease)
                    }

                    return handleRelease(releasePromise)
                }

                return true
            }

            const output = res.output ?? feature!.ctx.output

            ensureInput(res.input ?? feature!.ctx.input)

            if (input === feature!.ctx.input) {
                feature = undefined
                features = res.features(this.context(input, output), node)
            } else {
                const pCtx = this.context(input, output)
                pCtx.data = {}
                const ctx = pCtx as TransformFeatureContextWithData<typeof pCtx>

                // eslint-disable-next-line typescript/unbound-method
                feature = new TransformerNestedInputHandler(ctx, res.features)
                features = undefined

                this.features.push(feature)
            }

            return false
        }

        // Iterate until root input is handled
        while (!this.hasTransformed) {
            if (index >= length) {
                for (let i = this.features.length; i > 0; i--) {
                    feature = this.features.at(i - 1)

                    if (feature?.ctx.input !== input) {
                        if (feature) ensureInput(feature.ctx.input)

                        break
                    }

                    const releasePromise = this.release()
                    if (releasePromise instanceof Promise) await releasePromise
                }

                if (this.features.length === 0) this.hasTransformed = true

                continue
            }

            if (feature) {
                const resPromise = feature.handle(node)
                const res = resPromise instanceof Promise ? await resPromise : resPromise

                const handledPromise = handleRes(res)
                const handled = handledPromise instanceof Promise ? await handledPromise : handledPromise

                if (!handled) continue
            } else if (features) {
                let res: boolean | TransformFeatureSuccessor<IR, Parent, OR, Parent> = false

                for (feature of features) {
                    const resPromise = feature.handle(node)
                    res = resPromise instanceof Promise ? await resPromise : resPromise

                    if (res) break
                }

                features = undefined

                if (feature && res) {
                    this.features.push(feature)

                    const handledPromise = handleRes(res)
                    const handled = handledPromise instanceof Promise
                        ? await handledPromise
                        : handledPromise

                    if (!handled) continue
                } else {
                    feature = this.features.at(-1)
                }
            }

            this.indexes.set(input, ++index)

            // eslint-disable-next-line require-atomic-updates
            node = input.children[index]

            if (!feature && !features) {
                features = this.rootFeatures(this.context(this.inputRoot, this.outputRoot), node)
            }
        }
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

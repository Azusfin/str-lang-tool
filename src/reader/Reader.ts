/* eslint-disable promise/prefer-await-to-then */
/* eslint-disable typescript/strict-boolean-expressions */
/* eslint-disable no-await-in-loop */
/* eslint-disable typescript/no-non-null-assertion */

import type { Parent, Point } from "unist"
import type { ReadFeature, ReadFeatureContext, ReadFeatureContextNoData, ReadFeatureSuccessor } from "."

const CARRIAGE_RETURN_CODE_POINT = "\r".codePointAt(0)
const LINE_FEED_CODE_POINT = "\n".codePointAt(0)

export interface ReaderOptions<R extends Parent> {
    text: string
    root: R
    rootFeatures(ctx: ReadFeatureContextNoData<ReadFeatureContext<R, R>>): ReadFeature<R, R>[]
}

export class Reader<R extends Parent> {
    public readonly text: string
    public readonly root: R

    public readonly rootFeatures: (
        (ctx: ReadFeatureContextNoData<ReadFeatureContext<R, R>>) => ReadFeature<R, R>[]
    )

    public offset = 0
    public hasRead = false

    protected readonly codePoints: number[] = []
    protected readonly lineStarts: number[] = [0]
    protected readonly features: ReadFeature<R, Parent>[] = []

    constructor(options: ReaderOptions<R>) {
        this.text = options.text
        this.root = options.root

        // eslint-disable-next-line typescript/unbound-method
        this.rootFeatures = options.rootFeatures

        // Get the text codepoints and line information

        let i = 0
        let carriageReturnBefore = false

        for (const char of this.text) {
            const codePoint = char.codePointAt(0)!
            this.codePoints.push(codePoint)

            if (carriageReturnBefore) {
                carriageReturnBefore = false

                if (codePoint === LINE_FEED_CODE_POINT) {
                    this.lineStarts.push(i + 1)
                } else {
                    this.lineStarts.push(i)
                }
            } else if (codePoint === LINE_FEED_CODE_POINT) {
                this.lineStarts.push(i + 1)
            } else if (codePoint === CARRIAGE_RETURN_CODE_POINT) {
                carriageReturnBefore = true
            }

            i++
        }
    }

    public get length(): number {
        return this.codePoints.length
    }

    public async read(): Promise<R> {
        if (!this.hasRead) await this.iterate()
        return this.root
    }

    // Get current point on the text
    public point(offset: number = this.offset): Point {
        let line: number

        if (this.lineStarts.length === 1 || offset < this.lineStarts[1]) {
            line = 1
        } else if (offset >= this.lineStarts.at(-1)!) {
            line = this.lineStarts.length
        } else {
            // Do a binary search to find the line index

            let left = 0
            let right = this.lineStarts.length
            line = Math.floor(right / 2)

            while (left + 1 < right) {
                if (this.lineStarts[line] <= offset && offset <= this.lineStarts[line + 1]) {
                    line++
                    break
                }

                if (offset < this.lineStarts[line]) {
                    right = line
                } else {
                    left = line
                }

                line = left + Math.floor((right - left) / 2)
            }

            if (this.lineStarts[line] === offset) {
                line++
            }
        }

        const column = offset - this.lineStarts[line - 1] + 1

        return { line, column, offset }
    }

    protected context<A extends Parent>(ancestor: A): ReadFeatureContextNoData<ReadFeatureContext<R, A>> {
        return {
            root: this.root,
            ancestor,
            offset: () => this.offset,
            length: () => this.codePoints.length,
            point: (offset: number = this.offset) => this.point(offset),
            codePoint: (offset: number = this.offset) => this.codePoints[offset] ?? -1,
            char: (offset: number = this.offset) => (
                this.codePoints[offset]
                    ? String.fromCodePoint(this.codePoints[offset])
                    : ""
            )
        }
    }

    protected release(): (
        Promise<ReadFeature<R, Parent> | undefined> |
        ReadFeature<R, Parent> | undefined
    ) {
        const exitPromise = this.features.pop()?.exit()

        if (exitPromise instanceof Promise) {
            return exitPromise.then(() => this.features.at(-1))
        }

        return this.features.at(-1)
    }

    protected async iterate(): Promise<void> {
        const codePointsLength = this.codePoints.length

        let feature: ReadFeature<R, Parent> | undefined
        let features: ReadFeature<R, Parent>[] | undefined
        features = this.rootFeatures(this.context(this.root))

        // Handle feature releasing
        const handleRelease = (rFeature: ReadFeature<R, Parent> | undefined): false => {
            feature = rFeature
            if (!feature) features = this.rootFeatures(this.context(this.root))
            return false
        }

        // Handle result from feature handle
        const handleRes = (res: boolean | ReadFeatureSuccessor<R, Parent>): Promise<boolean> | boolean => {
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

            features = res.features(this.context(res.ancestor ?? feature!.ctx.ancestor))
            feature = undefined

            return false
        }

        // Iterate on code points
        while (this.offset < codePointsLength) {
            if (feature) {
                const resPromise = feature.handle()
                const res = resPromise instanceof Promise ? await resPromise : resPromise

                const handledPromise = handleRes(res)
                const handled = handledPromise instanceof Promise ? await handledPromise : handledPromise

                if (!handled) continue
            } else if (features) {
                let res: boolean | ReadFeatureSuccessor<R, Parent> = false

                for (feature of features) {
                    const resPromise = feature.handle()
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

            this.offset++
            if (!feature && !features) features = this.rootFeatures(this.context(this.root))
        }

        for (let i = this.features.length; i > 0; i--) {
            await this.release()
        }

        this.hasRead = true
    }
}

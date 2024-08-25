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

    public readonly rootFeatures:
        (ctx: ReadFeatureContextNoData<ReadFeatureContext<R, R>>) => ReadFeature<R, R>[]

    public offset = 0
    public hasRead = false

    protected readonly codePoints: number[]
    protected readonly lineStarts: number[] = [0]
    protected readonly features: ReadFeature<R, Parent>[] = []

    public constructor(options: ReaderOptions<R>) {
        this.text = options.text
        this.root = options.root
        this.rootFeatures = options.rootFeatures

        const codePoints = [...this.text]
        const codePointsLength = codePoints.length
        this.codePoints = new Array(codePointsLength)

        for (let i = 0; i < codePointsLength; i++) {
            const codePoint = codePoints[i].codePointAt(0)!
            this.codePoints[i] = codePoint

            if (codePoint === LINE_FEED_CODE_POINT) {
                this.lineStarts.push(i+1)
            } else if (codePoint === CARRIAGE_RETURN_CODE_POINT) {
                const nextCodePoint = codePoints[++i]?.codePointAt(0)
                if (nextCodePoint !== undefined) this.codePoints[i] = nextCodePoint
                if (nextCodePoint === LINE_FEED_CODE_POINT) {
                    this.lineStarts.push(i+1)
                } else {
                    this.lineStarts.push(i)
                }
            }
        }
    }

    public read(): Promise<R> {
        if (!this.hasRead) {
            return this.iterate().then(() => this.root)
        }
        return Promise.resolve(this.root)
    }

    public point(offset: number = this.offset): Point {
        let line = 1

        if (this.lineStarts.length === 1 || offset < this.lineStarts[1]) {
            line = 1
        } else if (offset >= this.lineStarts[this.lineStarts.length - 1]) {
            line = this.lineStarts.length
        } else {
            let right = this.lineStarts.length
            let left = 0
            line = Math.floor(right / 2)

            while (this.lineStarts[line] !== offset && right >= left) {
                if (right - left === 1) {
                    line = right
                    break
                }

                if (this.lineStarts[line] > offset) {
                    right = line
                    line = left + Math.floor((right - left) / 2)
                    if (right - left <= 2 && this.lineStarts[line] <= offset) {
                        line++
                        break
                    }
                } else {
                    left = line
                    line = left + Math.floor((right - left) / 2)
                    if (right - left <= 2 && this.lineStarts[line] > offset) {
                        break
                    }
                }
            }

            if (this.lineStarts[line] === offset) {
                line++
            }
        }

        const column = offset - this.lineStarts[line - 1] + 1

        return { line, column, offset }
    }

    protected context<A extends Parent>(ancestor: A)
        : ReadFeatureContextNoData<ReadFeatureContext<R, A>> {
        return {
            root: this.root,
            ancestor: ancestor,
            offset: () => this.offset,
            length: () => this.codePoints.length,
            point: (offset: number = this.offset) => this.point(offset),
            codePoint: (offset: number = this.offset) => this.codePoints[offset] ?? -1,
            char: (offset: number = this.offset) => {
                return this.codePoints[offset]
                    ? String.fromCodePoint(this.codePoints[offset])
                    : ""
            }
        }
    }

    protected release(): (
        Promise<ReadFeature<R, Parent> | undefined> |
        ReadFeature<R, Parent> | undefined
    ) {
        const promise = this.features.pop()?.exit()
        if (promise instanceof Promise) {
            return promise.then(() => this.features[this.features.length - 1])
        }
        return this.features[this.features.length - 1]
    }

    protected async iterate(): Promise<void> {
        const codePointsLength = this.codePoints.length

        while (!this.hasRead) {
            if (this.offset >= codePointsLength) {
                for (let i = this.features.length; i > 0; i--) {
                    const promise = this.release()
                    if (promise instanceof Promise) await promise
                }

                this.hasRead = true
                break
            }

            let feature: ReadFeature<R, Parent> | undefined = this.features[this.features.length - 1]
            let features: ReadFeature<R, Parent>[] | undefined

            if (!feature) {
                features = this.rootFeatures(this.context(this.root))
            }

            while (feature || features) {
                if (feature) {
                    const resPromise = feature.handle()
                    const res = resPromise instanceof Promise ? await resPromise : resPromise

                    if (typeof res === "boolean") {
                        if (!res) {
                            const releasePromise = this.release()
                            feature = (
                                releasePromise instanceof Promise ? await releasePromise : releasePromise
                            )
                            if (!feature) features = this.rootFeatures(this.context(this.root))
                            continue
                        }
                    } else {
                        features = res.features(this.context(res.ancestor ?? feature.ctx.ancestor))
                    }

                    feature = undefined
                } else if (features) {
                    if (!features.length) {
                        feature = undefined
                        features = undefined
                        continue
                    }

                    let res: boolean | ReadFeatureSuccessor<R, Parent> = false

                    for (feature of features) {
                        const resPromise = feature.handle()
                        res = resPromise instanceof Promise ? await resPromise : resPromise
                        if (res) break
                    }

                    if (feature && res) {
                        this.features.push(feature)
                        if (typeof res !== "boolean") {
                            features = res.features(this.context(res.ancestor ?? feature.ctx.ancestor))
                        } else {
                            features = undefined
                        }
                    } else {
                        features = undefined
                    }

                    feature = undefined
                }
            }

            this.offset++
        }
    }
}

export class ReadError extends Error {
    public position: number
    public name: string = "ReadError"

    public constructor(message: string, position: number) {
        super(`${message} (at position ${position})`)
        this.position = position
    }
}

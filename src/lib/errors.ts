export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
    public readonly code: string = "BAD_REQUEST"
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (what: string) =>
  new ApiError(`${what} not found.`, 404, "NOT_FOUND");

export const badRequest = (message: string) =>
  new ApiError(message, 400, "BAD_REQUEST");

export const serviceUnavailable = (message: string) =>
  new ApiError(message, 503, "SERVICE_UNAVAILABLE");

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 400, code = 'APP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} não encontrado`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Não autorizado') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Sem permissão') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class GatewayError extends AppError {
  public readonly gateway: string;
  public readonly rawError?: unknown;

  constructor(gateway: string, message: string, rawError?: unknown) {
    super(`[${gateway}] ${message}`, 502, 'GATEWAY_ERROR');
    this.gateway = gateway;
    this.rawError = rawError;
  }
}

export class DuplicateError extends AppError {
  constructor(message = 'Registro duplicado') {
    super(message, 409, 'DUPLICATE');
  }
}

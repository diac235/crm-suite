/** Error de aplicación con código HTTP y código de negocio legible. */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational = true;

  constructor(message: string, statusCode = 500, code = 'ERROR_INTERNO', details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, new.target);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Solicitud inválida', details?: unknown) {
    super(message, 400, 'SOLICITUD_INVALIDA', details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Los datos enviados no son válidos', details?: unknown) {
    super(message, 422, 'VALIDACION', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'No autenticado') {
    super(message, 401, 'NO_AUTENTICADO');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'No tiene permisos para realizar esta acción') {
    super(message, 403, 'SIN_PERMISO');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado') {
    super(message, 404, 'NO_ENCONTRADO');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'El recurso ya existe', details?: unknown) {
    super(message, 409, 'CONFLICTO', details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Demasiadas solicitudes, intente más tarde') {
    super(message, 429, 'DEMASIADAS_SOLICITUDES');
  }
}

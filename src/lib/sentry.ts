// Sentry deshabilitado temporalmente (pendiente de configurar DSN)
export function initSentry() {}
export function captureError(_error: Error, _context?: Record<string, any>) {}
export function captureMessage(_message: string, _level?: string) {}
export function addBreadcrumb(_message: string, _data?: Record<string, any>) {}
export function identifyUser(_userId: string, _email?: string, _name?: string) {}
export function clearUser() {}
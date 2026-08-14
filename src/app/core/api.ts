/**
 * Base del API. En desarrollo el backend corre en 3050; si el frontend se
 * publica detras del mismo dominio basta con dejar '/api'.
 */
export const API =
  typeof window !== 'undefined' && window.location.port === '4200'
    ? 'http://localhost:3050/api'
    : '/sitickets/backend/api/';

/**
 * A proposito NO son DTOs con class-validator: no tengo confirmado el
 * payload exacto que manda hoy el script Python contra el sistema viejo
 * (el ValidationPipe global usa forbidNonWhitelisted, asi que un DTO
 * adivinado podria rechazar de mas). El body se recibe tal cual (unknown) y
 * ImpresorasService lo interpreta de forma defensiva — ver extraeLecturas().
 * Una vez confirmado el contrato real, esto se puede endurecer a DTOs
 * propios.
 */
export type CuerpoPythonCompara = unknown;
export type CuerpoPythonNotificaError = unknown;

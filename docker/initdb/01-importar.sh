#!/bin/sh
# Solo corre la primera vez que se crea el volumen de la base (docker volume
# vacio). Para volver a importar: docker compose down -v && docker compose up.
set -e

mysql_root() { mysql -uroot -p"$MARIADB_ROOT_PASSWORD" "$@"; }

# Mismos nombres que en produccion: las migraciones cruzan de ticketsv2 a saf
# por nombre, asi que ambas tienen que vivir en este mismo servidor.
for base in adminplem_ticketsv2 adminplem_saf bienes eservice; do
  echo "Creando base $base"
  mysql_root -e "CREATE DATABASE IF NOT EXISTS \`$base\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
done

importar() {
  if [ -f "/dumps/$1" ]; then
    echo "Importando $1 en $2 (puede tardar un par de minutos)"
    mysql_root "$2" < "/dumps/$1"
  else
    echo "AVISO: no existe docker/dumps/$1; la base $2 queda vacia"
  fi
}

importar ticketsv2.sql adminplem_ticketsv2
importar saf.sql adminplem_saf

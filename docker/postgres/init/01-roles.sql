-- Separacion de roles exigida por el ADR 0001.
--
--   ets_owner    duenno de la base. Emite DDL. Lo usa Prisma (plano de control)
--                y el materializador (plano de datos, schemas proj_*).
--   app_runtime  solo DML. Lo usa el CRUD generico de las aplicaciones generadas.
--                No puede crear ni alterar estructura: un fallo del runtime no
--                puede tocar el esquema.
--
-- Contrasennas de desarrollo local. En produccion los roles se aprovisionan
-- aparte y las credenciales llegan por variables de entorno.

CREATE ROLE app_runtime LOGIN PASSWORD 'ets_runtime_password';

-- Nadie crea objetos por defecto.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON DATABASE ets FROM PUBLIC;

GRANT CONNECT ON DATABASE ets TO app_runtime;

-- app_runtime NO recibe permisos sobre los schemas proj_* aqui. El
-- materializador (F5) emite el GRANT concreto al crear cada schema de proyecto,
-- de modo que el runtime solo ve lo que existe.

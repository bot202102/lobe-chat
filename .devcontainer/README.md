# LobeChat Dev Container

Este directorio contiene la configuración completa para desarrollar LobeChat usando VS Code Dev Containers.

## 🚀 Inicio Rápido

1. **Asegúrate de tener instalado:**
   - Docker Desktop
   - VS Code con la extensión "Dev Containers"

2. **Abre el proyecto en el Dev Container:**
   - `Ctrl+Shift+P` → `Dev Containers: Reopen in Container`

3. **Espera a que se complete el setup** (\~3-5 minutos):
   - ✅ PostgreSQL se inicializa
   - ✅ MinIO configura el bucket `lobe`
   - ✅ Casdoor se configura para SSO
   - ✅ Se instalan las dependencias con pnpm
   - ✅ Se ejecutan las migraciones de base de datos

4. **Inicia el servidor de desarrollo:**

   ```bash
   pnpm dev
   ```

5. **Accede a la aplicación:**
   - 🌐 LobeChat: <http://localhost:3010>
   - 🗄️ MinIO Console: <http://localhost:9001>
   - 🔐 Casdoor: <http://localhost:8000>

## 🏗️ Arquitectura

El devcontainer incluye los siguientes servicios:

- **lobe-dev**: Contenedor principal de desarrollo (Node.js 22)
- **postgresql**: Base de datos con extensión pgvector
- **minio**: Almacenamiento S3-compatible para archivos
- **casdoor**: Sistema de autenticación SSO
- **searxng**: Motor de búsqueda metabuscador

## 📝 Configuración de Variables de Entorno

### Para Desarrollo Local

Todas las variables de entorno están pre-configuradas en `docker-compose.yml` con valores seguros para desarrollo.

### Para Añadir tus API Keys

Las API keys de proveedores de IA son opcionales. Puedes añadirlas de dos formas:

**Opción 1: Variables de entorno en el contenedor (Recomendado)**

Edita `.devcontainer/docker-compose.yml` y añade tus keys en la sección `environment` del servicio `lobe-dev`:

```yaml
environment:
  # ... configuración existente ...
  - OPENAI_API_KEY=tu-api-key-aqui
  - GOOGLE_API_KEY=tu-api-key-aqui
  - MISTRAL_API_KEY=tu-api-key-aqui
```

**Opción 2: Archivo .env en la raíz**

Crea un archivo `.env` en la raíz del proyecto (ya está en `.gitignore`):

```bash
cp .devcontainer/.env.example .env
# Edita .env con tus credenciales
```

## 🔧 Troubleshooting

### El contenedor no inicia / Error de permisos

```bash
# Limpia todos los volúmenes y reconstruye
docker compose -f .devcontainer/docker-compose.yml down -v
# Luego en VS Code: Dev Containers: Rebuild Container
```

### Error de autenticación de PostgreSQL

El contenedor automáticamente resetea la contraseña de PostgreSQL en cada inicio. Si persiste el error:

```bash
docker compose -f .devcontainer/docker-compose.yml down -v
```

### MinIO no tiene el bucket configurado

El bucket `lobe` se crea automáticamente. Si no existe:

```bash
# Dentro del devcontainer
docker exec -it $(docker ps -q -f name=minio) mc alias set myminio http://localhost:9000 admin lobechat123456
docker exec -it $(docker ps -q -f name=minio) mc mb myminio/lobe
```

## 📦 Volúmenes

- `postgres_data`: Datos persistentes de PostgreSQL
- `node_modules_cache`: Cache de dependencias npm (evita problemas de permisos en Windows)
- `next_cache`: Cache de compilación de Next.js
- `minio_data`: Archivos subidos a MinIO
- `casdoor_data`: Datos de configuración de Casdoor

## 🔒 Credenciales por Defecto

**⚠️ SOLO PARA DESARROLLO LOCAL - CAMBIA EN PRODUCCIÓN**

- **PostgreSQL**:
  - Usuario: `postgres`
  - Contraseña: `uWNZugjBqixf8dxC`
  - Base de datos: `lobechat`

- **MinIO**:
  - Usuario: `admin`
  - Contraseña: `lobechat123456`
  - Console: <http://localhost:9001>

- **Casdoor**:
  - Usuario: `admin`
  - Contraseña: `123`
  - Console: <http://localhost:8000>

## 🛠️ Comandos Útiles

```bash
# Instalar dependencias
pnpm install

# Ejecutar migraciones
pnpm db:migrate

# Iniciar desarrollo (Webpack)
pnpm dev

# Compilar para producción
pnpm build

# Ejecutar tests
bunx vitest run --silent='passed-only'

# Verificar tipos
bun run type-check
```

## 📚 Recursos

- [Guía de Desarrollo](../docs/development/start.mdx)
- [Estructura del Proyecto](../.cursor/rules/project-structure.mdc)
- [Guía de Testing](../.cursor/rules/testing-guide/testing-guide.mdc)

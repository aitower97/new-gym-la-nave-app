# Pruebas de extremo a extremo (Maestro)

Recorren la app de verdad en un emulador Android. Se lanzan con `npm run e2e`
(o `npm run e2e -- .maestro/01-menu-en-frio.yaml` para una sola).

## Preparación (una vez)

- **Maestro CLI** en `~/maestro` (o la ruta en `MAESTRO_BIN`).
- **Emulador Android 14 (API 34)**: Maestro no conecta con la imagen de Android 17 (API 37).
- **Build de desarrollo** instalada en el emulador y Metro arrancado (`npx expo start --dev-client`).
- **`.env.maestro.local`** (ignorado por git) con la cuenta de pruebas, que debe tener un plan con límite de clases:
  ```
  MAESTRO_EMAIL=...
  MAESTRO_PASSWORD=...
  ```

La base de datos es la de producción: las pruebas solo miran, o deshacen lo que hacen.

## Pruebas

| Fichero | Qué comprueba |
|---|---|
| `01-menu-en-frio.yaml` | Entrar, cerrar y volver a abrir con la caché del menú guardada (el fallo de 1.23.0) |
| `02-pantallas-socio.yaml` | Abrir cada pantalla del menú del socio sin pantalla de error |

Los elementos se buscan por `testID` (por ejemplo `menu-reservar`, `login-email`), no por texto.

## En CI

`.github/workflows/e2e.yml` las pasa en cada PR a `main`: compila un APK de release en GitHub Actions (sin builds de EAS) y lo prueba en un emulador Android 14. Necesita los secrets del repo `MAESTRO_EMAIL` y `MAESTRO_PASSWORD`. Si falla, el informe y las capturas quedan en el artefacto `maestro` de la ejecución.

# Login con Google y Apple — código hecho, falta configurar

> **Estado a 2026-09-25.** El código está en `develop` y **apagado**: los
> botones no aparecen hasta rellenar `src/config/socialAuth.ts`. Paquetes
> nativos ya instalados → la próxima build (la del release conjunto) los lleva.
>
> Lo que queda está en [Checklist para encenderlo](#checklist-para-encenderlo).

## Qué hay en el código

| Pieza | Dónde |
|---|---|
| IDs de Google y el interruptor de Apple | `src/config/socialAuth.ts` |
| Login nativo → `signInWithIdToken` | `src/utils/socialAuth.ts` |
| Enrutado común tras entrar (admin / alta / menú) | `src/utils/postLogin.ts` |
| Quién necesita alta, relay de Apple (con tests) | `src/utils/profileCompletion.ts` |
| Pantalla de alta obligatoria | `src/screens/CompleteProfileScreen.tsx` |
| Botones "Continuar con Google / Apple" | `src/components/auth/SocialLoginButtons.tsx` (Login y Registro) |

- **Alta obligatoria** para todo socio sin `accepted_terms_at` en sus metadatos
  (login social *y* socios antiguos dados de alta sin formulario). Los admins
  no pasan. Pide nombre, apodo, teléfono, fecha (edad mínima) y consentimiento;
  "Salir" o el botón atrás cierran sesión. Entra por las tres puertas: login,
  login social y sesión restaurada en `WelcomeScreen`.
- **Apple con correo oculto**: la pantalla de alta avisa de que, si ya era
  socio, salga y entre con su email para no perder plan ni reservas.
- Supabase enlaza solo la cuenta de Google con la existente si el email
  coincide y está verificado (automatic identity linking).

## Checklist para encenderlo

1. **Google Cloud** → Credentials → tres OAuth client IDs:
   - **Web** (va a Supabase y a `webClientId`).
   - **iOS**, bundle `es.lanave.app` (va a `iosClientId` y a `app.json`).
   - **Android**, package `es.lanave.app`, **dos veces**: una con el SHA-1 de
     la clave de subida de EAS (`eas credentials` → Android) y otra con el
     SHA-1 de *App signing key* de Google Play (Play Console → Configuración
     → Integridad de la app). Sin la segunda, falla en la app de la tienda.
2. **Supabase** → Authentication → Providers → **Google**: Client ID = el Web,
   su secret; en *Authorized Client IDs* añadir también el de iOS; activar
   **Skip nonce check** (el SDK de iOS mete un nonce que no conocemos).
3. **Apple Developer** → App ID `es.lanave.app` → activar *Sign in with Apple*
   (EAS suele sincronizarlo solo al compilar; `app.json` ya lleva
   `usesAppleSignIn`).
4. **Supabase** → Providers → **Apple**: activar y poner `es.lanave.app` en
   *Client IDs*. Para el login nativo no hace falta secret.
5. Código: rellenar `GOOGLE_AUTH` y poner `APPLE_AUTH_ENABLED = true`.
6. `app.json` → añadir a `plugins`:
   ```json
   ["@react-native-google-signin/google-signin", { "iosUrlScheme": "com.googleusercontent.apps.<ID_IOS_SIN_EL_SUFIJO>" }]
   ```
   Sin `iosUrlScheme` el prebuild de iOS falla: por eso no está puesto aún.
7. Build nueva (preview para probar, luego la de producción del release).

Lo que sigue es el análisis original; se queda como referencia.

---

## Lo que hay que entender antes de empezar

### Esto exige una build nueva

`expo-apple-authentication` y el SDK de Google son módulos nativos. No hay OTA
que valga: la política `fingerprint` que configuramos **se negará** a servir
este JavaScript a un binario que no los tenga, que es exactamente para lo que
está.

### Si sacas Google en iOS, Apple obliga a Sign in with Apple

No es opcional ni negociable: App Store la rechaza. Van juntas o no va ninguna.

### 🔴 El consentimiento RGPD se pierde por el camino

Es el punto que convierte esto en algo más que "añadir dos botones".

Hoy, `RegisterScreen` manda al registrarse:

```ts
accepted_terms_at: new Date().toISOString(),
accepted_terms_version: LEGAL.termsVersion,
```

Es la prueba del consentimiento del art. 7.1 RGPD, y vive en
`auth.users.raw_user_meta_data`. **51 de los 54 usuarios actuales la tienen.**

Un login social **no pasa por ese formulario**, así que crearía socios sin
ninguna prueba de que aceptaron nada. Eso no es un detalle de experiencia de
usuario: es un incumplimiento.

**Consecuencia:** hace falta una pantalla de alta posterior al primer login
social, obligatoria, que recoja el consentimiento y lo registre.

### Apple puede ocultar el email

Quien use "Ocultar mi correo" llega como `algo@privaterelay.appleid.com`. El
correo se reenvía de verdad, pero **solo mientras el usuario no revoque el
acceso a la app**. No sirve para identificar a un socio que ya conocías por su
email real.

### Cuentas duplicadas

Un socio registrado con email y contraseña que luego entre con Google usando
ese mismo correo puede acabar con **dos cuentas** — y por tanto perder su plan,
sus reservas y su historial. Supabase lo controla con la opción de enlazar
identidades, y depende de si el email está verificado en ambos lados.
**Decidir esto antes de abrirlo a los socios**, no después.

---

## Pasos

### 1. Trámites externos (hazlos primero, tardan)

**Google Cloud Console** → APIs & Services → Credentials. Hacen falta **tres**
OAuth client IDs:

| Tipo | Para qué |
|---|---|
| iOS | `bundleIdentifier` = `es.lanave.app` |
| Android | `package` = `es.lanave.app` + huella SHA-1 del certificado de EAS |
| Web | El que se configura en Supabase como "Client ID" |

La huella SHA-1 la da `eas credentials` → Android → Keystore.

**Apple Developer** → Certificates, Identifiers & Profiles:
- Activar la capacidad **Sign in with Apple** en el App ID `es.lanave.app`.

**Supabase** → Authentication → Providers:
- Habilitar **Google** con el *Web* client ID (y su secret).
- Habilitar **Apple** con el Service ID.

### 2. Paquetes

```bash
npx expo install expo-apple-authentication @react-native-google-signin/google-signin
```

En `app.json`, dentro de `plugins`:

```json
["@react-native-google-signin/google-signin", { "iosUrlScheme": "com.googleusercontent.apps.<TU_CLIENT_ID_IOS>" }],
"expo-apple-authentication"
```

Y en `ios`, añadir:

```json
"usesAppleSignIn": true
```

### 3. Código de autenticación

`src/utils/socialAuth.ts` — el patrón es el mismo para ambos: se obtiene un
*id token* del proveedor nativo y se cambia por una sesión de Supabase.

```ts
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { supabase } from '../lib/supabase';

export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) throw new Error('Apple no devolvió identityToken');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;

  // OJO: Apple solo manda el nombre la PRIMERA vez que se autoriza la app.
  // Si no se guarda aquí, no hay segunda oportunidad.
  return { session: data.session, nombreDeApple: credential.fullName };
}

export async function signInWithGoogle() {
  GoogleSignin.configure({ webClientId: '<WEB_CLIENT_ID>' });
  await GoogleSignin.hasPlayServices();
  const res = await GoogleSignin.signIn();
  const idToken = res.data?.idToken;
  if (!idToken) throw new Error('Google no devolvió idToken');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw error;
  return { session: data.session };
}
```

Se usa `signInWithIdToken` (flujo nativo) y no `signInWithOAuth` (flujo de
navegador) a propósito: mejor experiencia, sin salir de la app, y sin montar
deep links de vuelta.

### 4. Pantalla de alta obligatoria — la pieza que no se puede saltar

Tras el primer login social, y **antes de dejar usar la app**, hay que pedir:

- **Nombre completo** (Apple a veces no lo da; Google sí).
- **Aceptación de términos y privacidad**, con el mismo texto que `RegisterScreen`.

Y registrarla igual que el registro normal:

```ts
await supabase.auth.updateUser({
  data: {
    full_name: nombre,
    accepted_terms_at: new Date().toISOString(),
    accepted_terms_version: LEGAL.termsVersion,
  },
});
await supabase.from('profiles').update({ full_name: nombre }).eq('id', userId);
```

Cómo detectar que falta: el perfil no tiene `full_name`, o el usuario no tiene
`accepted_terms_at` en su metadata.

`handle_new_user` **no hay que tocarlo**: ya crea el perfil con `full_name`
nulo sin romperse, porque todas esas columnas admiten nulos. Lo único
obligatorio en `profiles` es `id` y `email`.

### 5. Botones

En `LoginScreen` y `RegisterScreen`. El de Apple **solo en iOS**
(`Platform.OS === 'ios'`) y usando `AppleAuthenticationButton`, cuyo aspecto
exige Apple en sus directrices.

---

## Probar

1. Cuenta de Google nueva → alta → comprobar que pide nombre y consentimiento.
2. Apple con **"Ocultar mi correo"** → comprobar que el alta funciona igual.
3. Cerrar sesión y volver a entrar → **no** debe volver a pedir el alta.
4. Comprobar en la base que quedó la prueba del consentimiento:

```sql
SELECT email, raw_user_meta_data->>'accepted_terms_at' AS consentimiento,
       raw_user_meta_data->>'accepted_terms_version'  AS version
FROM auth.users ORDER BY created_at DESC LIMIT 5;
```

5. Y que no se ha duplicado ningún socio:

```sql
SELECT email, count(*) FROM auth.users GROUP BY email HAVING count(*) > 1;
```

---

## Suelto, del mismo tema

La edge function `create-user` (altas hechas por el admin) **tampoco registra
el consentimiento**: son los 3 usuarios de 54 que hoy no lo tienen. Si esos
socios se dieron de alta en persona y firmaron en papel, no hay problema. Si
no, conviene arreglarlo mientras se toca todo esto.

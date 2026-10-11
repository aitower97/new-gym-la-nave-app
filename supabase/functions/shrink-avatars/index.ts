// Reduce las fotos de perfil a 256×256 JPEG en el mismo sitio (misma URL) y
// guarda al lado una de 720×720 (<nombre>-lg.jpg) solo para el visor a
// pantalla completa (AvatarLightbox): se descarga únicamente al tocar la foto,
// así las listas siguen gastando lo mismo y la foto ampliada no se ve borrosa.
//
// Por qué: los avatares se subían a tamaño de cámara (400 KB de media, hasta
// 1,9 MB) y se pintan en círculos de ~40 px. La lista de apuntados de cada
// clase los descarga una y otra vez, y eso se comía ~850 MB al día de
// "cached egress" — el plan gratuito da 5,5 GB al mes.
//
// Lo llama el cron `shrink-avatars-hourly` (una petición por fichero grande,
// ver 20261001090000_shrink_avatars_cron.sql). Body: {"path": "<userId>/avatar-….jpg"}.
// Solo con x-cron-secret: nadie más debe poder reescribir fotos de otros.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
  MagickGeometry,
  MagickColor,
  MagickReadSettings,
  AlphaOption,
} from 'npm:@imagemagick/magick-wasm@0.0.30';

const wasmBytes = await Deno.readFile(
  new URL('magick.wasm', import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.30')),
);
await initializeImageMagick(wasmBytes);

const SIZE = 256;
const LARGE = 720;
const QUALITY = 80;
// Fondo para PNG con transparencia (el JPEG no la tiene): el gris de la app
const BACKGROUND = '#1a1a1a';

/** Ancho y alto de un JPEG leyendo solo su cabecera (null si no es JPEG). */
function jpegSize(d: Uint8Array): { w: number; h: number } | null {
  if (d[0] !== 0xff || d[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < d.length && d[i] === 0xff) {
    const marker = d[i + 1];
    const len = (d[i + 2] << 8) | d[i + 3];
    // SOF0..SOF15 salvo DHT (C4), JPG (C8) y DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: (d[i + 5] << 8) | d[i + 6], w: (d[i + 7] << 8) | d[i + 8] };
    }
    i += 2 + len;
  }
  return null;
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  }

  const { path } = await req.json().catch(() => ({}));
  if (typeof path !== 'string' || !path || path.includes('..')) {
    return new Response(JSON.stringify({ error: 'path requerido' }), { status: 400 });
  }
  // La versión grande ya es el resultado: no se vuelve a reducir
  if (path.endsWith('-lg.jpg')) {
    return new Response(JSON.stringify({ path, skipped: 'versión grande' }));
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: file, error: dlError } = await admin.storage.from('avatars').download(path);
  if (dlError || !file) {
    return new Response(JSON.stringify({ path, error: dlError?.message ?? 'no existe' }), { status: 404 });
  }
  const original = new Uint8Array(await file.arrayBuffer());

  let output: Uint8Array;
  let large: Uint8Array;
  try {
    // Pista al decodificador JPEG: decodifica ya reducido (escala DCT), nunca
    // por debajo de LARGE. Sin esto, una foto de 12 MP no cabe en la CPU que
    // da una Edge Function. Solo si la foto es mayor: con una más pequeña el
    // decodificador la AGRANDARÍA hasta la pista.
    const settings = new MagickReadSettings();
    const dims = jpegSize(original);
    if (dims && Math.min(dims.w, dims.h) > LARGE) {
      settings.setDefine(MagickFormat.Jpeg, 'size', `${LARGE}x${LARGE}`);
    }
    [large, output] = ImageMagick.read(original, settings, (img) => {
      // Gira según el EXIF antes de quitarlo, o las fotos de móvil salen de lado
      img.autoOrient();
      // Recorte cuadrado centrado: igual que "cover"
      const side = Math.min(img.width, img.height);
      img.crop(new MagickGeometry(Math.floor((img.width - side) / 2), Math.floor((img.height - side) / 2), side, side));
      img.backgroundColor = new MagickColor(BACKGROUND);
      img.alpha(AlphaOption.Remove);
      img.strip();
      img.quality = QUALITY;
      // Primero la grande (sin agrandar nunca una foto pequeña), luego la de 256
      const big = new MagickGeometry(LARGE, LARGE);
      big.greater = true;
      img.resize(big);
      const lg = img.write(MagickFormat.Jpeg, (data) => new Uint8Array(data));
      img.resize(new MagickGeometry(SIZE, SIZE));
      return [lg, img.write(MagickFormat.Jpeg, (data) => new Uint8Array(data))] as [Uint8Array, Uint8Array];
    });
  } catch (e) {
    console.error('shrink-avatars', path, e);
    return new Response(JSON.stringify({ path, error: String(e) }), { status: 422 });
  }

  // La grande antes que la pequeña: si esto falla, el original sigue intacto
  const largePath = path.replace(/\.[^./]+$/, '') + '-lg.jpg';
  const { error: lgError } = await admin.storage.from('avatars').upload(largePath, large, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: true,
  });
  if (lgError) {
    return new Response(JSON.stringify({ path, error: lgError.message }), { status: 500 });
  }

  if (output.byteLength >= original.byteLength) {
    return new Response(JSON.stringify({ path, skipped: 'ya era pequeña', bytes: original.byteLength, large: large.byteLength }));
  }

  // Un año de caché: cada subida nueva lleva su propio nombre (avatar-<ts>)
  const { error: upError } = await admin.storage.from('avatars').upload(path, output, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: true,
  });
  if (upError) {
    return new Response(JSON.stringify({ path, error: upError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ path, before: original.byteLength, after: output.byteLength, large: large.byteLength }));
});

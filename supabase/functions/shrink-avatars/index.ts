// Reduce las fotos de perfil a 256×256 JPEG en el mismo sitio (misma URL).
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
const QUALITY = 80;
// Fondo para PNG con transparencia (el JPEG no la tiene): el gris de la app
const BACKGROUND = '#1a1a1a';

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  }

  const { path } = await req.json().catch(() => ({}));
  if (typeof path !== 'string' || !path || path.includes('..')) {
    return new Response(JSON.stringify({ error: 'path requerido' }), { status: 400 });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: file, error: dlError } = await admin.storage.from('avatars').download(path);
  if (dlError || !file) {
    return new Response(JSON.stringify({ path, error: dlError?.message ?? 'no existe' }), { status: 404 });
  }
  const original = new Uint8Array(await file.arrayBuffer());

  let output: Uint8Array;
  try {
    // Pista al decodificador JPEG: decodifica ya reducido (escala DCT). Sin
    // esto, una foto de 12 MP no cabe en la CPU que da una Edge Function.
    const settings = new MagickReadSettings();
    settings.setDefine(MagickFormat.Jpeg, 'size', `${SIZE * 2}x${SIZE * 2}`);
    output = ImageMagick.read(original, settings, (img) => {
      // Gira según el EXIF antes de quitarlo, o las fotos de móvil salen de lado
      img.autoOrient();
      // Recorte cuadrado centrado y luego reducción: igual que "cover"
      const side = Math.min(img.width, img.height);
      img.crop(new MagickGeometry(Math.floor((img.width - side) / 2), Math.floor((img.height - side) / 2), side, side));
      img.resize(new MagickGeometry(SIZE, SIZE));
      img.backgroundColor = new MagickColor(BACKGROUND);
      img.alpha(AlphaOption.Remove);
      img.strip();
      img.quality = QUALITY;
      return img.write(MagickFormat.Jpeg, (data) => new Uint8Array(data));
    });
  } catch (e) {
    console.error('shrink-avatars', path, e);
    return new Response(JSON.stringify({ path, error: String(e) }), { status: 422 });
  }

  if (output.byteLength >= original.byteLength) {
    return new Response(JSON.stringify({ path, skipped: 'ya era pequeña', bytes: original.byteLength }));
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

  return new Response(JSON.stringify({ path, before: original.byteLength, after: output.byteLength }));
});

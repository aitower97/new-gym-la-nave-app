import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Cliente con permisos admin (bypassa RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface Template {
  id: string;
  user_id: string;
  day_of_week: number;
  class_time: string;
  class_type: string;
}

interface ClassMatch {
  id: string;
  class_date: string;
  class_time: string;
  class_type: string;
  max_spots: number;
}

Deno.serve(async (req) => {
  try {
    console.log('🚀 Starting weekly template application...');

    // 1. Obtener fechas de la próxima semana (lunes a domingo)
    const today = new Date();
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + ((1 + 7 - today.getDay()) % 7 || 7));
    nextMonday.setHours(0, 0, 0, 0);

    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);
    nextSunday.setHours(23, 59, 59, 999);

    const startDate = nextMonday.toISOString().split('T')[0];
    const endDate = nextSunday.toISOString().split('T')[0];

    console.log(`📅 Date range: ${startDate} to ${endDate}`);

    // 2. Cargar todas las plantillas activas
    const { data: templates, error: templatesError } = await supabase
      .from('booking_templates')
      .select('*')
      .eq('is_active', true);

    if (templatesError) throw templatesError;

    if (!templates || templates.length === 0) {
      console.log('⚠️ No active templates found');
      return new Response(
        JSON.stringify({ message: 'No active templates', applied: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${templates.length} active templates`);

    // 3. Cargar clases de la próxima semana
    const { data: classes, error: classesError } = await supabase
      .from('classes')
      .select('id, class_date, class_time, class_type, max_spots')
      .gte('class_date', startDate)
      .lte('class_date', endDate);

    if (classesError) throw classesError;

    if (!classes || classes.length === 0) {
      console.log('⚠️ No classes found for next week');
      return new Response(
        JSON.stringify({ message: 'No classes next week', applied: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🏋️ Found ${classes.length} classes next week`);

    // 4. Matchear plantillas con clases
    const bookingsToCreate: Array<{
      user_id: string;
      class_id: string;
      template_id: string;
    }> = [];

    for (const template of templates as Template[]) {
      for (const classItem of classes as ClassMatch[]) {
        const classDate = new Date(classItem.class_date + 'T00:00:00');
        const classDayOfWeek = classDate.getDay();

        // Match: mismo día de semana + misma hora + mismo tipo
        if (
          classDayOfWeek === template.day_of_week &&
          classItem.class_time === template.class_time &&
          classItem.class_type === template.class_type
        ) {
          // Verificar que el usuario no esté ya reservado
          const { data: existingBooking } = await supabase
            .from('bookings')
            .select('id')
            .eq('user_id', template.user_id)
            .eq('class_id', classItem.id)
            .single();

          if (!existingBooking) {
            // Verificar que la clase no esté llena
            const { count: currentBookings } = await supabase
              .from('bookings')
              .select('*', { count: 'exact', head: true })
              .eq('class_id', classItem.id);

            if ((currentBookings || 0) < classItem.max_spots) {
              bookingsToCreate.push({
                user_id: template.user_id,
                class_id: classItem.id,
                template_id: template.id,
              });
            } else {
              console.log(`⚠️ Class ${classItem.id} is full, skipping`);
            }
          }
        }
      }
    }

    console.log(`✅ ${bookingsToCreate.length} bookings to create`);

    // 5. Crear bookings
    if (bookingsToCreate.length > 0) {
      const { error: insertError } = await supabase
        .from('bookings')
        .insert(
          bookingsToCreate.map((b) => ({
            user_id: b.user_id,
            class_id: b.class_id,
          }))
        );

      if (insertError) throw insertError;

      // 6. Enviar notificaciones
      const notifications = bookingsToCreate.map((b) => {
        const classItem = classes.find((c) => c.id === b.class_id);
        return {
          user_id: b.user_id,
          type: 'template_applied',
          title: 'Reserva automática',
          message: `Tu plantilla semanal te ha reservado en ${classItem?.class_type} el ${classItem?.class_date}.`,
          class_id: b.class_id,
        };
      });

      await supabase.from('notifications').insert(notifications);

      console.log(`📧 ${notifications.length} notifications created`);

      // 7. Enviar el push real — este cron corre sin ningún cliente conectado,
      //    así que a diferencia del resto de la app (que envía el push desde
      //    el propio dispositivo del admin) aquí hay que llamar a la API de
      //    Expo directamente con service_role.
      const userIds = [...new Set(bookingsToCreate.map((b) => b.user_id))];
      const { data: tokens, error: tokensError } = await supabase
        .from('push_tokens')
        .select('user_id, token')
        .in('user_id', userIds);

      if (tokensError) {
        console.error('Error obteniendo push tokens:', tokensError.message);
      } else if (tokens && tokens.length > 0) {
        const messages = tokens.map(({ user_id, token }) => {
          const booking = bookingsToCreate.find((b) => b.user_id === user_id);
          const classItem = classes.find((c) => c.id === booking?.class_id);
          return {
            to: token,
            sound: 'default' as const,
            title: 'Reserva automática',
            body: `Tu plantilla semanal te ha reservado en ${classItem?.class_type} el ${classItem?.class_date}.`,
            data: { type: 'template_applied', class_id: booking?.class_id },
          };
        });

        const pushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(messages),
        });

        if (!pushResponse.ok) {
          console.error('Expo push API error:', await pushResponse.text());
        } else {
          console.log(`📲 ${messages.length} push notifications sent`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        applied: bookingsToCreate.length,
        templates_checked: templates.length,
        classes_checked: classes.length,
        date_range: { start: startDate, end: endDate },
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { getSupabaseClient } from '@dokuvault/shared';
import type { DocumentDate } from '@dokuvault/shared';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function scheduleDeadlineNotifications() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;

  // Cancel previously scheduled notifications to avoid duplicates
  await Notifications.cancelAllScheduledNotificationsAsync();

  const supabaseUrl = (await SecureStore.getItemAsync('supabase_url')) ?? '';
  const supabaseAnonKey = (await SecureStore.getItemAsync('supabase_anon_key')) ?? '';
  if (!supabaseUrl || !supabaseAnonKey) return;

  const client = getSupabaseClient(supabaseUrl, supabaseAnonKey);
  const today = new Date().toISOString().split('T')[0];

  const { data: deadlines } = await client
    .from('document_dates')
    .select('*')
    .gte('date', today)
    .order('date')
    .limit(20);

  if (!deadlines) return;

  for (const deadline of deadlines as DocumentDate[]) {
    const deadlineDate = new Date(deadline.date);
    deadlineDate.setHours(8, 0, 0, 0);

    // Schedule reminder 3 days before (if in the future)
    const reminderDate = new Date(deadlineDate);
    reminderDate.setDate(reminderDate.getDate() - 3);

    if (reminderDate > new Date()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Frist in 3 Tagen',
          body: deadline.label,
          data: { deadlineId: deadline.id, documentId: deadline.document_id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminderDate,
        },
      });
    }

    // Schedule on-day reminder
    if (deadlineDate > new Date()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Frist heute!',
          body: deadline.label,
          data: { deadlineId: deadline.id, documentId: deadline.document_id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: deadlineDate,
        },
      });
    }
  }
}

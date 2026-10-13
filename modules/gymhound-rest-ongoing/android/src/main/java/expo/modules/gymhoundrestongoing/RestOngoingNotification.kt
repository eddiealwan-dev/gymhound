package expo.modules.gymhoundrestongoing

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * Posts and cancels the one ongoing rest notification (fixed id [NOTIFICATION_ID]).
 * A plain notification, not a foreground service: nothing runs while the rest counts down;
 * the system draws the chronometer and removes the notification at its timeout.
 *
 * Android APIs used (minSdk 26, R202):
 * - `NotificationChannel(id, name, IMPORTANCE_LOW)`, `setSound(null, null)`, `enableVibration(false)`,
 *   `setShowBadge(false)`, `NotificationManager.createNotificationChannel` (API 26; idempotent, so
 *   calling it on each show creates the channel on the first one and is a no-op after).
 * - `NotificationCompat.Builder(context, channelId)` (androidx.core):
 *   `setSmallIcon`, `setContentTitle`, `setContentText`, `setOngoing(true)`, `setOnlyAlertOnce(true)`,
 *   `setSilent(true)`, `setUsesChronometer(true)`, `setChronometerCountDown(true)` (platform API 24),
 *   `setWhen(endsAt)`, `setShowWhen(true)`, `setTimeoutAfter(ms)` (platform API 26),
 *   `setCategory(CATEGORY_STOPWATCH)`, `setPriority(PRIORITY_LOW)` (pre-26 only),
 *   `setVisibility(VISIBILITY_PUBLIC)` (shown on the lock screen), `setContentIntent`.
 * - `PackageManager.getLaunchIntentForPackage` + `PendingIntent.getActivity(..., FLAG_UPDATE_CURRENT or
 *   FLAG_IMMUTABLE)` (FLAG_IMMUTABLE: API 23; required from API 31).
 * - `NotificationManagerCompat.areNotificationsEnabled`, `ContextCompat.checkSelfPermission(POST_NOTIFICATIONS)`
 *   (the runtime permission exists from API 33), `NotificationManagerCompat.notify` / `cancel`.
 */
internal object RestOngoingNotification {
  const val CHANNEL_ID = "rest-ongoing"
  const val CHANNEL_NAME = "Rest timer countdown"
  const val NOTIFICATION_ID = 4711

  @SuppressLint("MissingPermission") // checked in canPost
  fun show(context: Context, endsAt: Long, title: String, text: String) {
    val manager = NotificationManagerCompat.from(context)
    if (!canPost(context, manager)) return

    val remaining = endsAt - System.currentTimeMillis()
    if (remaining <= 0) {
      // setTimeoutAfter(0) would mean "never time out": a rest already over shows nothing.
      manager.cancel(NOTIFICATION_ID)
      return
    }

    ensureChannel(context)

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon(context))
      .setContentTitle(title)
      .setContentText(text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setUsesChronometer(true)
      .setChronometerCountDown(true)
      .setWhen(endsAt)
      .setShowWhen(true)
      .setTimeoutAfter(remaining)
      .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

    launchIntent(context)?.let { builder.setContentIntent(it) }

    // Same id: replaces the one shown (±15 s, a new rest).
    manager.notify(NOTIFICATION_ID, builder.build())
  }

  fun hide(context: Context) {
    NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
  }

  private fun canPost(context: Context, manager: NotificationManagerCompat): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      return false
    }
    return manager.areNotificationsEnabled()
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW).apply {
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
    }
    val system = context.getSystemService(NotificationManager::class.java) ?: return
    system.createNotificationChannel(channel)
  }

  /**
   * The monochrome `notification_icon` drawable when the expo-notifications plugin has written one
   * (its `icon` option), else the app's own icon (`applicationInfo.icon`), as the plan names.
   */
  @SuppressLint("DiscouragedApi")
  private fun smallIcon(context: Context): Int {
    val drawable = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (drawable != 0) drawable else context.applicationInfo.icon
  }

  private fun launchIntent(context: Context): PendingIntent? {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    return PendingIntent.getActivity(
      context,
      NOTIFICATION_ID,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }
}

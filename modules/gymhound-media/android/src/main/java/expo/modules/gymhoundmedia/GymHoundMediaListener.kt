package expo.modules.gymhoundmedia

import android.service.notification.NotificationListenerService

/**
 * Exists only so the person can grant GymHound notification access once (R216): an enabled
 * NotificationListenerService is what lets [android.media.session.MediaSessionManager.getActiveSessions]
 * list other apps' media sessions. It reads no notification: none of the `onNotification*`
 * callbacks is overridden.
 *
 * Declared in the app's AndroidManifest by plugins/withGymhoundMedia.js with
 * `android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"`, `exported="false"`
 * and the `android.service.notification.NotificationListenerService` intent filter.
 */
class GymHoundMediaListener : NotificationListenerService()

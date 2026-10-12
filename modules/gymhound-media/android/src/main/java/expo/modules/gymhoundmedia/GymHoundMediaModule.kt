package expo.modules.gymhoundmedia

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * GymHound's media control on Android (Task 8a, R216): the active media session of whichever
 * player is playing (Spotify, Apple Music for Android, YouTube Music, ...).
 *
 * Android APIs used (all API 21+ unless noted; minSdk is 26):
 * - [MediaSessionManager.getActiveSessions] with the [ComponentName] of [GymHoundMediaListener];
 *   it throws [SecurityException] unless that NotificationListenerService is enabled.
 * - [MediaSessionManager.addOnActiveSessionsChangedListener] (the overload with a [Handler]) and
 *   [MediaSessionManager.removeOnActiveSessionsChangedListener].
 * - [MediaController.getMetadata] ([MediaMetadata.METADATA_KEY_TITLE], [MediaMetadata.METADATA_KEY_ARTIST],
 *   [MediaMetadata.METADATA_KEY_DURATION]), [MediaController.getPlaybackState] ([PlaybackState.STATE_PLAYING],
 *   position, last position update time, speed), [MediaController.getPackageName].
 * - [MediaController.getTransportControls]: play, pause, skipToNext, skipToPrevious, seekTo.
 * - [MediaController.registerCallback] (with a [Handler]) / [MediaController.unregisterCallback].
 * - [NotificationManagerCompat.getEnabledListenerPackages] (androidx.core, an `api` dependency of
 *   expo-modules-core) for access.
 * - [Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS] to ask for it.
 *
 * Listener state is only touched on the main thread (posted to [mainHandler]).
 */
class GymHoundMediaModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var observing = false
  private var sessionsListener: MediaSessionManager.OnActiveSessionsChangedListener? = null
  /** The manager the listener was registered with, so it can be removed without the React context. */
  private var registeredManager: MediaSessionManager? = null
  private var watched: MediaController? = null
  /** The last PlaybackState.state / playing flag a playback-state `change` was sent for (main thread). */
  private var lastState: Int? = null
  private var lastPlaying: Boolean? = null

  private val controllerCallback = object : MediaController.Callback() {
    // Players report position updates through this callback too; only a new state or playing
    // flag is a change the bar shows.
    override fun onPlaybackStateChanged(state: PlaybackState?) {
      val code = state?.state
      val playing = code == PlaybackState.STATE_PLAYING
      if (code == lastState && playing == lastPlaying) return
      lastState = code
      lastPlaying = playing
      emitChange()
    }

    override fun onMetadataChanged(metadata: MediaMetadata?) = emitChange()

    override fun onSessionDestroyed() {
      try {
        watch(firstController())
      } catch (e: Exception) {
        watch(null)
      }
      emitChange()
    }
  }

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("GymHoundMedia")

    Events("change")

    AsyncFunction("access") {
      val state = accessName()
      if (state == "granted") {
        mainHandler.post { startWatchingIfObserved() }
      }
      state
    }

    AsyncFunction("requestAccess") {
      openListenerSettings()
      accessName()
    }

    AsyncFunction("nowPlaying") {
      readNowPlaying()
    }

    AsyncFunction("play") {
      requireController().transportControls.play()
    }

    AsyncFunction("pause") {
      requireController().transportControls.pause()
    }

    AsyncFunction("next") {
      requireController().transportControls.skipToNext()
    }

    AsyncFunction("previous") {
      requireController().transportControls.skipToPrevious()
    }

    AsyncFunction("seekBy") { seconds: Double ->
      seekBy(seconds)
    }

    OnStartObserving("change") {
      mainHandler.post {
        observing = true
        startWatchingIfObserved()
      }
    }

    OnStopObserving("change") {
      mainHandler.post {
        observing = false
        stopWatching()
      }
    }

    OnDestroy {
      mainHandler.post {
        observing = false
        stopWatching()
      }
    }
  }

  private fun hasAccess(): Boolean =
    NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)

  private fun accessName(): String = if (hasAccess()) "granted" else "denied"

  private fun listenerComponent() = ComponentName(context, GymHoundMediaListener::class.java)

  private fun sessionManager(): MediaSessionManager? =
    context.getSystemService(Context.MEDIA_SESSION_SERVICE) as? MediaSessionManager

  /** The first active session (the system orders them by priority, most recently active first). */
  private fun firstController(): MediaController? {
    if (!hasAccess()) return null
    return try {
      sessionManager()?.getActiveSessions(listenerComponent())?.firstOrNull()
    } catch (e: SecurityException) {
      null
    }
  }

  private fun requireController(): MediaController =
    firstController() ?: throw NoPlayerException()

  private fun readNowPlaying(): Map<String, Any?>? {
    val controller = firstController() ?: return null
    mainHandler.post { startWatchingIfObserved() }
    val metadata = controller.metadata
    val title = metadata?.getString(MediaMetadata.METADATA_KEY_TITLE)?.takeIf { it.isNotEmpty() }
    val artist = metadata?.getString(MediaMetadata.METADATA_KEY_ARTIST)?.takeIf { it.isNotEmpty() }
    return mapOf(
      "title" to title,
      "artist" to artist,
      "playing" to (controller.playbackState?.state == PlaybackState.STATE_PLAYING),
      "source" to controller.packageName
    )
  }

  private fun seekBy(seconds: Double) {
    val controller = requireController()
    val state = controller.playbackState ?: throw NoPlayerException()
    if ((state.actions and PlaybackState.ACTION_SEEK_TO) == 0L) throw NoPlayerException()
    var position = state.position
    if (state.state == PlaybackState.STATE_PLAYING && state.lastPositionUpdateTime > 0) {
      val elapsed = SystemClock.elapsedRealtime() - state.lastPositionUpdateTime
      position += (elapsed * state.playbackSpeed).toLong()
    }
    var target = maxOf(0L, position + (seconds * 1000).toLong())
    val duration = controller.metadata?.getLong(MediaMetadata.METADATA_KEY_DURATION) ?: 0L
    if (duration > 0) {
      target = minOf(target, duration)
    }
    controller.transportControls.seekTo(target)
  }

  private fun openListenerSettings() {
    val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
    val activity = appContext.currentActivity
    if (activity != null) {
      activity.startActivity(intent)
    } else {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  // Main thread only from here down.

  private fun startWatchingIfObserved() {
    if (!observing || sessionsListener != null) return
    try {
      val manager = sessionManager() ?: return
      if (!hasAccess()) return
      val listener = MediaSessionManager.OnActiveSessionsChangedListener { controllers ->
        watch(controllers?.firstOrNull())
        emitChange()
      }
      manager.addOnActiveSessionsChangedListener(listener, listenerComponent(), mainHandler)
      sessionsListener = listener
      registeredManager = manager
      watch(firstController())
    } catch (e: Exception) {
      Log.w(TAG, "GymHound: couldn't watch media sessions", e)
    }
  }

  private fun stopWatching() {
    val listener = sessionsListener
    val manager = registeredManager
    sessionsListener = null
    registeredManager = null
    watch(null)
    if (listener != null && manager != null) {
      try {
        manager.removeOnActiveSessionsChangedListener(listener)
      } catch (e: Exception) {
        Log.w(TAG, "GymHound: couldn't stop watching media sessions", e)
      }
    }
  }

  private fun watch(controller: MediaController?) {
    val current = watched
    if (current != null && controller != null && current.sessionToken == controller.sessionToken) return
    current?.unregisterCallback(controllerCallback)
    watched = controller
    lastState = controller?.playbackState?.state
    lastPlaying = lastState == PlaybackState.STATE_PLAYING
    controller?.registerCallback(controllerCallback, mainHandler)
  }

  private fun emitChange() {
    try {
      sendEvent("change", emptyMap<String, Any?>())
    } catch (e: Exception) {
      Log.w(TAG, "GymHound: couldn't send the media change event", e)
    }
  }

  private class NoPlayerException :
    CodedException("ERR_NO_PLAYER", "No media session is active", null)

  private companion object {
    const val TAG = "GymHoundMedia"
  }
}

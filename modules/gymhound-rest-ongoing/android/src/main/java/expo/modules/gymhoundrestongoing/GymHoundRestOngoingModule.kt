package expo.modules.gymhoundrestongoing

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * GymHound's Android rest countdown (R202): a silent, low-importance ongoing notification whose
 * chronometer counts down to the end of the rest and which removes itself at zero.
 *
 * JS shape (modules/gymhound-rest-ongoing/index.ts, reached only through `optionalNativeModule`):
 *   show(endsAt: number, title: string, text: string): Promise<void>  // replaces the one shown
 *   hide(): Promise<void>
 *
 * Expo Modules API (expo-modules-core 57): `Module`, `ModuleDefinition`, `Name`, `AsyncFunction`.
 * Async functions run off the main thread; posting and cancelling a notification is thread safe.
 */
class GymHoundRestOngoingModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("GymHoundRestOngoing")

    // endsAt is epoch milliseconds from JS; a JS number arrives as Double.
    AsyncFunction("show") { endsAt: Double, title: String, text: String ->
      RestOngoingNotification.show(context, endsAt.toLong(), title, text)
    }

    AsyncFunction<Unit>("hide") {
      RestOngoingNotification.hide(context)
    }
  }
}

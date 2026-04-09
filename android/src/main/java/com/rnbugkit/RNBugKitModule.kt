package com.rnbugkit

import android.graphics.Bitmap
import android.graphics.Canvas
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.View
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream
import kotlin.math.sqrt

class RNBugKitModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), SensorEventListener {

  companion object {
    const val NAME = "RNBugKit"

    // Shake detection constants
    private const val SHAKE_THRESHOLD = 2.5f      // G-force threshold
    private const val SHAKE_COOLDOWN_MS = 1000L   // Min ms între shake-uri
    private const val SHAKE_COUNT_RESET_MS = 500L // Reset counter după ms
    private const val SHAKE_MIN_COUNT = 2         // Shake-uri necesare
  }

  private var sensorManager: SensorManager? = null
  private var accelerometer: Sensor? = null
  private var shakeEnabled = false
  private var hasListeners = false

  private var lastShakeTime = 0L
  private var shakeCount = 0
  private var lastShakeCountTime = 0L

  private val mainHandler = Handler(Looper.getMainLooper())

  override fun getName() = NAME

  override fun initialize() {
    super.initialize()
    sensorManager = reactContext.getSystemService(SensorManager::class.java)
    accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
  }

  override fun onCatalystInstanceDestroy() {
    stopShakeDetection()
    super.onCatalystInstanceDestroy()
  }

  // ─── Shake Detection ────────────────────────────────────────────────────────

  @ReactMethod
  fun setShakeEnabled(enabled: Boolean) {
    shakeEnabled = enabled
    if (enabled) startShakeDetection() else stopShakeDetection()
  }

  private fun startShakeDetection() {
    sensorManager?.registerListener(
      this,
      accelerometer,
      SensorManager.SENSOR_DELAY_UI
    )
  }

  private fun stopShakeDetection() {
    sensorManager?.unregisterListener(this)
    shakeCount = 0
  }

  override fun onSensorChanged(event: SensorEvent?) {
    if (!shakeEnabled || event == null) return
    if (event.sensor.type != Sensor.TYPE_ACCELEROMETER) return

    val x = event.values[0]
    val y = event.values[1]
    val z = event.values[2]

    // Calculam G-force fara gravitatie
    val gForce = sqrt((x * x + y * y + z * z).toDouble()).toFloat() / SensorManager.GRAVITY_EARTH

    if (gForce < SHAKE_THRESHOLD) return

    val now = System.currentTimeMillis()

    // Reset counter daca a trecut prea mult timp
    if (now - lastShakeCountTime > SHAKE_COUNT_RESET_MS) {
      shakeCount = 0
    }

    // Cooldown — nu trimite shake prea des
    if (now - lastShakeTime < SHAKE_COOLDOWN_MS) return

    shakeCount++
    lastShakeCountTime = now

    if (shakeCount >= SHAKE_MIN_COUNT) {
      shakeCount = 0
      lastShakeTime = now
      sendShakeEvent()
    }
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

  private fun sendShakeEvent() {
    if (!hasListeners) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("RNBugKitShake", null)
  }

  // ─── Screenshot ─────────────────────────────────────────────────────────────

  @ReactMethod
  fun captureScreen(promise: Promise) {
    mainHandler.post {
      try {
        val activity = currentActivity
        if (activity == null) {
          promise.reject("NO_ACTIVITY", "No current activity")
          return@post
        }

        val rootView: View = activity.window.decorView.rootView

        val bitmap = Bitmap.createBitmap(
          rootView.width,
          rootView.height,
          Bitmap.Config.ARGB_8888
        )

        val canvas = Canvas(bitmap)
        rootView.draw(canvas)

        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 80, stream)
        bitmap.recycle()

        val base64 = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
        promise.resolve(base64)
      } catch (e: Exception) {
        promise.reject("SCREENSHOT_FAILED", e.message, e)
      }
    }
  }

  // ─── Event Emitter ──────────────────────────────────────────────────────────

  @ReactMethod
  fun addListener(eventName: String) {
    hasListeners = true
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    if (count >= 1) hasListeners = false
  }
}
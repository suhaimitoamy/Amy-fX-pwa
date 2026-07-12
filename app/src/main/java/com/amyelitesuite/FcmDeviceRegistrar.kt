package com.amyelitesuite

import android.content.Context
import android.provider.Settings
import com.google.firebase.messaging.FirebaseMessaging
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object FcmDeviceRegistrar {
    private const val ENDPOINT =
        "https://wliecyxzlwhmtftnfnps.supabase.co/functions/v1/device-register"
    private const val PREFS = "amy_fcm_registration"
    private const val KEY_TOKEN = "last_token"
    private const val KEY_REGISTERED_AT = "registered_at"
    private const val REFRESH_AFTER_MS = 24L * 60L * 60L * 1000L

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    fun registerCurrentToken(context: Context, force: Boolean = false) {
        val appContext = context.applicationContext
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token ->
                if (!token.isNullOrBlank()) register(appContext, token, force)
            }
            .addOnFailureListener { error ->
                android.util.Log.w("AmyFX-FCM", "Unable to read FCM token", error)
            }
    }

    fun register(context: Context, token: String, force: Boolean = false) {
        if (token.isBlank()) return
        val appContext = context.applicationContext
        val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val previousToken = prefs.getString(KEY_TOKEN, null)
        val registeredAt = prefs.getLong(KEY_REGISTERED_AT, 0L)
        val registrationFresh = previousToken == token &&
            System.currentTimeMillis() - registeredAt < REFRESH_AFTER_MS

        if (!force && registrationFresh) return

        Thread {
            try {
                val deviceId = Settings.Secure.getString(
                    appContext.contentResolver,
                    Settings.Secure.ANDROID_ID
                ) ?: return@Thread

                val payload = JSONObject().apply {
                    put("deviceId", deviceId)
                    put("fcmToken", token)
                    put("appVersion", BuildConfig.VERSION_NAME)
                    put("enabled", true)
                }

                val prefsAmy = appContext.getSharedPreferences("AmyFXPrefs", Context.MODE_PRIVATE)
                val anonKey = prefsAmy.getString("supabase_anon_key", "eyJhbG...0p6k") ?: "eyJhbG...0p6k"

                val request = Request.Builder()
                    .url(ENDPOINT)
                    .header("User-Agent", "AmyFX-Android/${BuildConfig.VERSION_NAME}")
                    .header("Authorization", "Bearer $anonKey")
                    .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                    .build()

                client.newCall(request).execute().use { response ->
                    if (response.isSuccessful) {
                        prefs.edit()
                            .putString(KEY_TOKEN, token)
                            .putLong(KEY_REGISTERED_AT, System.currentTimeMillis())
                            .apply()
                    } else {
                        android.util.Log.w(
                            "AmyFX-FCM",
                            "Token registration failed: HTTP ${response.code}"
                        )
                    }
                }
            } catch (error: Exception) {
                android.util.Log.w("AmyFX-FCM", "Token registration error", error)
            }
        }.start()
    }
}

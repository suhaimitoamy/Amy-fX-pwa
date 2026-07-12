package com.amyelitesuite

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

class ScannerService : Service() {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val client = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .build()
    private var socket: WebSocket? = null
    private var reconnectJob: Job? = null
    private var watchdogJob: Job? = null
    private var apiKey: String? = null
    private var setupUpper = 0.0
    private var setupLower = 0.0
    private var lastPrice = 0.0
    private var reconnectAttempt = 0
    @Volatile private var lastTickAt = System.currentTimeMillis()
    @Volatile private var manualClose = false
    private var lastNotificationUpdateMs = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP_SCANNER) {
            prefs().edit().putBoolean(KEY_SCANNER_ENABLED, false).apply()
            stopSocket()
            stopForeground(true)
            stopSelf()
            return START_NOT_STICKY
        }

        createChannels()
        loadApiKey()
        prefs().edit().putBoolean(KEY_SCANNER_ENABLED, true).apply()
        loadTargets(intent)

        if (targetsExpired()) {
            clearTargets()
            sendInfo("Amy FX Scanner", "Target Mapping sudah lebih dari 24 jam. Buka Mapping untuk update level terbaru.")
        }

        if (apiKey.isNullOrBlank()) {
            prefs().edit().putBoolean(KEY_SCANNER_ENABLED, false).apply()
            stopForeground(true)
            stopSelf()
            return START_NOT_STICKY
        }

        startStatusNotification(force = true)
        connectSocket()
        startWatchdog()
        return START_STICKY
    }

    private fun loadApiKey() {
        val secureKey = SecurePrefs.getString(this, KEY_API_KEY, null)
        val legacyKey = prefs().getString(KEY_API_KEY, null)
        apiKey = secureKey ?: legacyKey
        if (!legacyKey.isNullOrBlank()) {
            if (secureKey.isNullOrBlank()) {
                SecurePrefs.putString(this, KEY_API_KEY, legacyKey)
            }
            prefs().edit().remove(KEY_API_KEY).apply()
        }
    }

    private fun loadTargets(intent: Intent?) {
        val savedUpper = prefs().getString(KEY_BSL_TARGET, null)?.toDoubleOrNull() ?: 0.0
        val savedLower = prefs().getString(KEY_SSL_TARGET, null)?.toDoubleOrNull() ?: 0.0
        val passedUpper = intent?.getStringExtra("bsl")?.toDoubleOrNull() ?: 0.0
        val passedLower = intent?.getStringExtra("ssl")?.toDoubleOrNull() ?: 0.0
        val rawUpper = if (passedUpper > 0.0) passedUpper else savedUpper
        val rawLower = if (passedLower > 0.0) passedLower else savedLower
        val oldUpper = setupUpper
        val oldLower = setupLower

        if (rawUpper > 0.0 && rawLower > 0.0) {
            setupUpper = max(rawUpper, rawLower)
            setupLower = min(rawUpper, rawLower)
        } else {
            setupUpper = rawUpper
            setupLower = rawLower
        }

        val changed = abs(oldUpper - setupUpper) > PRICE_EPSILON || abs(oldLower - setupLower) > PRICE_EPSILON
        if (changed) {
            prefs().edit()
                .putString(KEY_BSL_TARGET, if (setupUpper > 0.0) setupUpper.toString() else "")
                .putString(KEY_SSL_TARGET, if (setupLower > 0.0) setupLower.toString() else "")
                .putLong(KEY_TARGET_UPDATED_AT, System.currentTimeMillis())
                .putBoolean(KEY_UPPER_ARMED, true)
                .putBoolean(KEY_LOWER_ARMED, true)
                .apply()
        }
    }

    private fun connectSocket() {
        stopSocket(suppressReconnect = false)
        manualClose = false
        val key = apiKey?.trim().orEmpty()
        if (key.isBlank()) return
        val url = "wss://ws.twelvedata.com/v1/quotes/price?apikey=$key"
        val request = Request.Builder().url(url).build()
        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                lastTickAt = System.currentTimeMillis()
                reconnectAttempt = 0
                reconnectJob?.cancel()
                reconnectJob = null
                webSocket.send("""{"action":"subscribe","params":{"symbols":"XAU/USD"}}""")
                sendInfo("Amy FX Scanner", "Scanner terhubung ke live price XAU/USD.")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val json = JSONObject(text)
                    if (!json.has("price")) return
                    val price = json.getDouble("price")
                    lastPrice = price
                    lastTickAt = System.currentTimeMillis()
                    checkTargets(price)
                } catch (_: Exception) {
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (socket !== webSocket || manualClose) return
                scheduleReconnect()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (socket !== webSocket || manualClose) return
                scheduleReconnect()
            }
        })
    }

    private fun checkTargets(price: Double) {
        if (targetsExpired()) {
            clearTargets()
            startStatusNotification()
            return
        }

        if (setupUpper > 0.0) {
            if (price < setupUpper - RESET_DISTANCE) {
                prefs().edit().putBoolean(KEY_UPPER_ARMED, true).apply()
            }
            if (price >= setupUpper && prefs().getBoolean(KEY_UPPER_ARMED, true)) {
                maybeSendTargetAlert(
                    levelKey = "UPPER_${fmt(setupUpper)}",
                    title = "🎯 XAU/USD — Target Atas Tersentuh!",
                    message = "Level: ${fmt(setupUpper)} | Harga: ${fmt(price)}\nHTF Bias: Lihat Mapping | Setup Score: Lihat Mapping\nTap untuk buka Mapping →"
                )
                prefs().edit().putBoolean(KEY_UPPER_ARMED, false).apply()
            }
        }

        if (setupLower > 0.0) {
            if (price > setupLower + RESET_DISTANCE) {
                prefs().edit().putBoolean(KEY_LOWER_ARMED, true).apply()
            }
            if (price <= setupLower && prefs().getBoolean(KEY_LOWER_ARMED, true)) {
                maybeSendTargetAlert(
                    levelKey = "LOWER_${fmt(setupLower)}",
                    title = "🎯 XAU/USD — Target Bawah Tersentuh!",
                    message = "Level: ${fmt(setupLower)} | Harga: ${fmt(price)}\nHTF Bias: Lihat Mapping | Setup Score: Lihat Mapping\nTap untuk buka Mapping →"
                )
                prefs().edit().putBoolean(KEY_LOWER_ARMED, false).apply()
            }
        }

        startStatusNotification()
    }

    private fun maybeSendTargetAlert(levelKey: String, title: String, message: String) {
        val now = System.currentTimeMillis()
        val cooldownKey = "notify_cooldown_$levelKey"
        val lastSentAt = prefs().getLong(cooldownKey, 0L)
        if (now - lastSentAt < ALERT_COOLDOWN_MS) return
        prefs().edit().putLong(cooldownKey, now).apply()
        sendAlert(title, message)
    }

    private fun scheduleReconnect() {
        if (reconnectJob?.isActive == true) return
        reconnectJob = scope.launch {
            reconnectAttempt += 1
            val delayMs = when (reconnectAttempt) {
                1 -> 15_000L
                2 -> 30_000L
                3 -> 60_000L
                4 -> 120_000L
                5 -> 300_000L
                else -> 600_000L
            }
            if (reconnectAttempt >= 6) {
                sendInfo("Amy FX Scanner", "Scanner kesulitan terhubung. Reconnect otomatis tetap berjalan tiap 10 menit.")
            }
            delay(delayMs)
            connectSocket()
        }
    }

    private fun startWatchdog() {
        if (watchdogJob?.isActive == true) return
        watchdogJob = scope.launch {
            while (true) {
                delay(60_000L)
                val noTickMs = System.currentTimeMillis() - lastTickAt
                if (noTickMs > 120_000L) {
                    scheduleReconnect()
                    lastTickAt = System.currentTimeMillis()
                }
            }
        }
    }

    private fun startStatusNotification(force: Boolean = false) {
        val now = System.currentTimeMillis()
        if (!force && now - lastNotificationUpdateMs < 5000L) return
        lastNotificationUpdateMs = now

        val intent = mappingIntent("Dashboard")
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val priceText = if (lastPrice > 0.0) "XAU/USD: ${fmt(lastPrice)}" else "XAU/USD: menunggu tick"
        val text = "Amy FX aktif | $priceText"
        val body = "Scanner aktif. ${targetText()}"
        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_SCANNER_FOREGROUND)
                .setContentTitle("Amy FX Scanner")
                .setContentText(text)
                .setStyle(Notification.BigTextStyle().bigText(body))
                .setSmallIcon(R.drawable.ic_stat_amy_fx)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setContentTitle("Amy FX Scanner")
                .setContentText(text)
                .setStyle(Notification.BigTextStyle().bigText(body))
                .setSmallIcon(R.drawable.ic_stat_amy_fx)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build()
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(FOREGROUND_NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(FOREGROUND_NOTIFICATION_ID, notification)
        }
    }

    private fun sendAlert(title: String, message: String) {
        val pendingIntent = PendingIntent.getActivity(
            this,
            System.currentTimeMillis().toInt(),
            mappingIntent("Analyze"),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_TARGET_ALERT)
                .setContentTitle(title)
                .setContentText(message)
                .setStyle(Notification.BigTextStyle().bigText(message))
                .setSmallIcon(R.drawable.ic_stat_amy_fx)
                .setContentIntent(pendingIntent)
                .setPriority(Notification.PRIORITY_HIGH)
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setDefaults(Notification.DEFAULT_ALL)
                .setAutoCancel(true)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setContentTitle(title)
                .setContentText(message)
                .setStyle(Notification.BigTextStyle().bigText(message))
                .setSmallIcon(R.drawable.ic_stat_amy_fx)
                .setContentIntent(pendingIntent)
                .setPriority(Notification.PRIORITY_HIGH)
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setDefaults(Notification.DEFAULT_ALL)
                .setAutoCancel(true)
                .build()
        }
        val gateKey = "global|" + title + "|" + message
        if (AmyFxNotificationGate.shouldNotify(applicationContext, gateKey, System.currentTimeMillis())) {
            notificationManager().notify(AmyFxNotificationGate.stableId(gateKey, TARGET_NOTIFICATION_BASE_ID + abs(message.hashCode() % 100000)), notification)
        } // AMYFX_NOTIFY_NATIVE_FIX
    }

    private fun sendInfo(title: String, message: String) {
        val gateKey = "global|" + title + "|" + message
        if (AmyFxNotificationGate.shouldNotify(applicationContext, gateKey, System.currentTimeMillis())) {
            try {
                AmyFxNotificationGate.markNotified(applicationContext, "global|" + title + "|" + message, System.currentTimeMillis());
            } catch (_: Exception) {}
            val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Notification.Builder(this, CHANNEL_INFO)
                    .setContentTitle(title)
                    .setContentText(message)
                    .setStyle(Notification.BigTextStyle().bigText(message))
                    .setSmallIcon(R.drawable.ic_stat_amy_fx)
                    .setAutoCancel(true)
                    .build()
            } else {
                @Suppress("DEPRECATION")
                Notification.Builder(this)
                    .setContentTitle(title)
                    .setContentText(message)
                    .setStyle(Notification.BigTextStyle().bigText(message))
                    .setSmallIcon(R.drawable.ic_stat_amy_fx)
                    .setAutoCancel(true)
                    .build()
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            nm.notify(AmyFxNotificationGate.stableId(gateKey, INFO_NOTIFICATION_ID), notification)
        }
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_SCANNER_FOREGROUND,
                "Amy FX Scanner Foreground",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Silent foreground scanner status"
                setSound(null, null)
            }
            val alertChannel = NotificationChannel(
                CHANNEL_TARGET_ALERT,
                "Amy FX Target Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "BSL/SSL target touch alerts"
                enableVibration(true)
                enableLights(true)
            }
            val infoChannel = NotificationChannel(
                CHANNEL_INFO,
                "Amy FX Info",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Connection and scanner information"
            }
            notificationManager().createNotificationChannel(serviceChannel)
            notificationManager().createNotificationChannel(alertChannel)
            notificationManager().createNotificationChannel(infoChannel)
        }
    }

    private fun stopSocket(suppressReconnect: Boolean = true) {
        if (suppressReconnect) {
            manualClose = true
            reconnectJob?.cancel()
            reconnectJob = null
        }
        val current = socket
        socket = null
        current?.close(1000, "Scanner stopped")
    }

    private fun targetText(): String {
        return when {
            setupUpper > 0.0 && setupLower > 0.0 -> "Target aktif: Atas ${fmt(setupUpper)} | Bawah ${fmt(setupLower)}"
            setupUpper > 0.0 -> "Target aktif: Atas ${fmt(setupUpper)}"
            setupLower > 0.0 -> "Target aktif: Bawah ${fmt(setupLower)}"
            else -> "Menunggu target area dari Mapping"
        }
    }

    private fun targetsExpired(): Boolean {
        val updatedAt = prefs().getLong(KEY_TARGET_UPDATED_AT, 0L)
        if (updatedAt <= 0L) return false
        return System.currentTimeMillis() - updatedAt > TARGET_EXPIRY_MS
    }

    private fun clearTargets() {
        setupUpper = 0.0
        setupLower = 0.0
        prefs().edit()
            .remove(KEY_BSL_TARGET)
            .remove(KEY_SSL_TARGET)
            .remove(KEY_TARGET_UPDATED_AT)
            .putBoolean(KEY_UPPER_ARMED, true)
            .putBoolean(KEY_LOWER_ARMED, true)
            .apply()
    }

    private fun mappingIntent(route: String = "Analyze"): Intent {
        val safeRoute = if (route == "Dashboard") "Dashboard" else "Analyze"
        return Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("target_url", "https://appassets.androidplatform.net/assets/apps/mapping/index.html#$safeRoute")
            putExtra("amyfx_route", safeRoute)
            data = android.net.Uri.parse("amyfx://mapping?route=$safeRoute")
        }
    }

    private fun notificationManager(): NotificationManager {
        return getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    }

    private fun prefs() = getSharedPreferences("AmyFXPrefs", Context.MODE_PRIVATE)

    private fun fmt(value: Double): String {
        if (value <= 0.0) return "-"
        return String.format("%.2f", value)
    }

    override fun onDestroy() {
        stopSocket()
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val ACTION_STOP_SCANNER = "STOP_SCANNER"
        private const val KEY_API_KEY = "api_key"
        private const val KEY_SCANNER_ENABLED = "scanner_enabled"
        private const val KEY_BSL_TARGET = "scanner_bsl_target"
        private const val KEY_SSL_TARGET = "scanner_ssl_target"
        private const val KEY_TARGET_UPDATED_AT = "scanner_target_updated_at"
        private const val KEY_UPPER_ARMED = "scanner_upper_armed"
        private const val KEY_LOWER_ARMED = "scanner_lower_armed"
        private const val CHANNEL_SCANNER_FOREGROUND = "amyfx_scanner_foreground"
        private const val CHANNEL_TARGET_ALERT = "amyfx_target_alert"
        private const val CHANNEL_INFO = "amyfx_info"
        private const val FOREGROUND_NOTIFICATION_ID = 1
        private const val INFO_NOTIFICATION_ID = 11
        private const val TARGET_NOTIFICATION_BASE_ID = 1000
        private const val ALERT_COOLDOWN_MS = 30L * 60L * 1000L
        private const val TARGET_EXPIRY_MS = 24L * 60L * 60L * 1000L
        private const val PRICE_EPSILON = 0.01
        private const val RESET_DISTANCE = 2.00
    }
}

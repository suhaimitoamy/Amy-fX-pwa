package com.amyelitesuite

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.IBinder
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

class ScannerService : Service() {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val client = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    private var marketJob: Job? = null
    private var newsJob: Job? = null
    private var setupUpper = 0.0
    private var setupLower = 0.0
    private var lastPrice = 0.0
    private var marketOnline = false
    private var lastNotificationUpdateMs = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP_SCANNER) {
            stopSelf()
            return START_NOT_STICKY
        }

        createChannels()
        prefs().edit().putBoolean(KEY_SCANNER_ENABLED, true).apply()
        loadTargets(intent)

        if (targetsExpired()) clearTargets()

        startStatusNotification(force = true)
        ensureMarketMonitor()
        ensureNewsMonitor()
        return START_STICKY
    }

    private fun ensureMarketMonitor() {
        if (marketJob?.isActive == true) return
        marketJob = scope.launch {
            var failures = 0
            while (isActive) {
                try {
                    pollMarket()
                    failures = 0
                    delay(MARKET_POLL_MS)
                } catch (error: Exception) {
                    marketOnline = false
                    failures += 1
                    startStatusNotification()
                    val retry = min(60_000L, 10_000L * failures.coerceAtMost(6))
                    delay(retry)
                }
            }
        }
    }

    private fun ensureNewsMonitor() {
        if (newsJob?.isActive == true) return
        newsJob = scope.launch {
            while (isActive) {
                try {
                    pollNews()
                } catch (error: Exception) {
                    android.util.Log.w("AmyFX-News", "Background news check failed", error)
                }
                delay(NEWS_POLL_MS)
            }
        }
    }

    private fun pollMarket() {
        val request = Request.Builder()
            .url(MARKET_URL)
            .header("Cache-Control", "no-cache")
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) error("Market HTTP ${response.code}")
            val payload = response.body?.string().orEmpty()
            val json = JSONObject(payload)
            if (json.optString("status") != "ok") {
                error(json.optString("message", "Market response error"))
            }
            val values = json.optJSONArray("values") ?: error("Market values missing")
            val latest = values.optJSONObject(0) ?: error("Latest market candle missing")
            val price = latest.optString("close").toDoubleOrNull()
                ?: latest.optDouble("close", Double.NaN)
            if (!price.isFinite() || price <= 0.0) error("Invalid market price")

            lastPrice = price
            marketOnline = true
            checkTargets(price)
            startStatusNotification()
        }
    }

    private fun pollNews() {
        val request = Request.Builder()
            .url(NEWS_URL)
            .header("Cache-Control", "no-cache")
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) error("News HTTP ${response.code}")
            val json = JSONObject(response.body?.string().orEmpty())
            val items = json.optJSONArray("news") ?: return
            if (items.length() == 0) return

            var latest: JSONObject? = null
            var latestNumericId = Long.MIN_VALUE
            for (index in 0 until items.length()) {
                val item = items.optJSONObject(index) ?: continue
                val numericId = item.optString("id").toLongOrNull()
                if (latest == null || (numericId != null && numericId > latestNumericId)) {
                    latest = item
                    if (numericId != null) latestNumericId = numericId
                }
            }

            val item = latest ?: return
            val newsId = item.optString("id").trim()
            if (newsId.isBlank()) return

            val storedId = prefs().getString(KEY_LAST_NEWS_ID, null)
            if (storedId == null) {
                prefs().edit().putString(KEY_LAST_NEWS_ID, newsId).apply()
                return
            }
            if (storedId == newsId) return

            val body = item.optString("text").ifBlank {
                item.optString("textOriginal", "Berita baru XAU/USD tersedia.")
            }.take(MAX_NEWS_BODY)
            val impact = item.optString("impact")
            val title = if (impact.equals("high", ignoreCase = true)) {
                "Breaking News Penting XAU/USD"
            } else {
                "Breaking News XAU/USD"
            }

            sendNewsNotification(title, body, newsId)
            prefs().edit().putString(KEY_LAST_NEWS_ID, newsId).apply()
        }
    }

    private fun loadTargets(intent: Intent?) {
        val savedUpper = prefs().getString(KEY_BSL_TARGET, null)?.toDoubleOrNull() ?: 0.0
        val savedLower = prefs().getString(KEY_SSL_TARGET, null)?.toDoubleOrNull() ?: 0.0

        val hasUpper = intent?.hasExtra("bsl") == true
        val hasLower = intent?.hasExtra("ssl") == true
        val passedUpper = intent?.getStringExtra("bsl")?.toDoubleOrNull() ?: 0.0
        val passedLower = intent?.getStringExtra("ssl")?.toDoubleOrNull() ?: 0.0

        val rawUpper = if (hasUpper) passedUpper else savedUpper
        val rawLower = if (hasLower) passedLower else savedLower

        val oldUpper = setupUpper
        val oldLower = setupLower

        if (rawUpper > 0.0 && rawLower > 0.0) {
            setupUpper = max(rawUpper, rawLower)
            setupLower = min(rawUpper, rawLower)
        } else {
            setupUpper = rawUpper.coerceAtLeast(0.0)
            setupLower = rawLower.coerceAtLeast(0.0)
        }

        val changed = abs(oldUpper - setupUpper) > PRICE_EPSILON ||
            abs(oldLower - setupLower) > PRICE_EPSILON

        if (changed || hasUpper || hasLower) {
            prefs().edit()
                .putString(KEY_BSL_TARGET, if (setupUpper > 0.0) setupUpper.toString() else "")
                .putString(KEY_SSL_TARGET, if (setupLower > 0.0) setupLower.toString() else "")
                .putLong(KEY_TARGET_UPDATED_AT, System.currentTimeMillis())
                .putBoolean(KEY_UPPER_ARMED, true)
                .putBoolean(KEY_LOWER_ARMED, true)
                .apply()
            startStatusNotification(force = true)
        }
    }

    private fun checkTargets(price: Double) {
        if (targetsExpired()) {
            clearTargets()
            return
        }

        if (setupUpper > 0.0) {
            if (price < setupUpper - RESET_DISTANCE) {
                prefs().edit().putBoolean(KEY_UPPER_ARMED, true).apply()
            }
            if (price >= setupUpper && prefs().getBoolean(KEY_UPPER_ARMED, true)) {
                sendTargetAlert(
                    levelKey = "UPPER_${fmt(setupUpper)}",
                    title = "🎯 XAU/USD — Area SELL Tersentuh",
                    message = "Area ${fmt(setupUpper)} tersentuh pada harga ${fmt(price)}. Tap untuk membuka Mapping."
                )
                prefs().edit().putBoolean(KEY_UPPER_ARMED, false).apply()
            }
        }

        if (setupLower > 0.0) {
            if (price > setupLower + RESET_DISTANCE) {
                prefs().edit().putBoolean(KEY_LOWER_ARMED, true).apply()
            }
            if (price <= setupLower && prefs().getBoolean(KEY_LOWER_ARMED, true)) {
                sendTargetAlert(
                    levelKey = "LOWER_${fmt(setupLower)}",
                    title = "🎯 XAU/USD — Area BUY Tersentuh",
                    message = "Area ${fmt(setupLower)} tersentuh pada harga ${fmt(price)}. Tap untuk membuka Mapping."
                )
                prefs().edit().putBoolean(KEY_LOWER_ARMED, false).apply()
            }
        }
    }

    private fun sendTargetAlert(levelKey: String, title: String, message: String) {
        if (!canPostNotifications()) return
        val gateKey = "target|$levelKey"
        if (!AmyFxNotificationGate.shouldNotify(this, gateKey, System.currentTimeMillis())) return

        val pendingIntent = PendingIntent.getActivity(
            this,
            AmyFxNotificationGate.stableId(gateKey, TARGET_NOTIFICATION_BASE_ID),
            mappingIntent("Analyze"),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = Notification.Builder(this, CHANNEL_TARGET_ALERT)
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

        notificationManager().notify(
            AmyFxNotificationGate.stableId(gateKey, TARGET_NOTIFICATION_BASE_ID),
            notification
        )
    }

    private fun sendNewsNotification(title: String, message: String, newsId: String) {
        if (!canPostNotifications()) return

        val gateKey = AmyFxNotificationGate.newsContentKey(message)
        if (!AmyFxNotificationGate.shouldNotify(this, gateKey, System.currentTimeMillis())) return

        val targetUrl =
            "https://appassets.androidplatform.net/assets/apps/market-intel/index.html#news=${Uri.encode(newsId)}"
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("target_url", targetUrl)
        }
        val requestCode = newsId.hashCode()
        val pendingIntent = PendingIntent.getActivity(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = Notification.Builder(this, CHANNEL_NEWS)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(Notification.BigTextStyle().bigText(message))
            .setSmallIcon(R.drawable.ic_stat_amy_fx)
            .setContentIntent(pendingIntent)
            .setPriority(Notification.PRIORITY_HIGH)
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .build()

        notificationManager().notify(
            AmyFxNotificationGate.stableId(gateKey, requestCode),
            notification
        )
    }

    private fun startStatusNotification(force: Boolean = false) {
        val now = System.currentTimeMillis()
        if (!force && now - lastNotificationUpdateMs < STATUS_UPDATE_MIN_MS) return
        lastNotificationUpdateMs = now

        val pendingIntent = PendingIntent.getActivity(
            this,
            FOREGROUND_NOTIFICATION_ID,
            mappingIntent("Dashboard"),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val priceText = if (lastPrice > 0.0) {
            "XAU/USD ${fmt(lastPrice)}"
        } else {
            "menunggu harga"
        }
        val connectionText = if (marketOnline) "aktif" else "menghubungkan"
        val notification = Notification.Builder(this, CHANNEL_SCANNER_FOREGROUND)
            .setContentTitle("Amy FX Monitor otomatis")
            .setContentText("Market $connectionText • $priceText")
            .setStyle(
                Notification.BigTextStyle().bigText(
                    "News aktif otomatis. ${targetText()} Market $connectionText."
                )
            )
            .setSmallIcon(R.drawable.ic_stat_amy_fx)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                FOREGROUND_NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(FOREGROUND_NOTIFICATION_ID, notification)
        }
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val serviceChannel = NotificationChannel(
            CHANNEL_SCANNER_FOREGROUND,
            "Amy FX Monitor Otomatis",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Menjaga news dan target Mapping tetap aktif saat aplikasi ditutup"
            setSound(null, null)
        }
        val targetChannel = NotificationChannel(
            CHANNEL_TARGET_ALERT,
            "Amy FX Target Alerts",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Peringatan saat harga menyentuh area Mapping"
            enableVibration(true)
            enableLights(true)
        }
        val newsChannel = NotificationChannel(
            CHANNEL_NEWS,
            "Amy FX Breaking News",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Breaking news yang relevan untuk XAU/USD"
            enableVibration(true)
            enableLights(true)
        }

        notificationManager().createNotificationChannels(
            listOf(serviceChannel, targetChannel, newsChannel)
        )
    }

    private fun mappingIntent(route: String): Intent {
        val url = AmyFxNotificationGate.routeUrl(route)
        return Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("target_url", url)
            putExtra("amyfx_route", route)
        }
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
        startStatusNotification(force = true)
    }

    private fun targetsExpired(): Boolean {
        if (setupUpper <= 0.0 && setupLower <= 0.0) return false
        val updatedAt = prefs().getLong(KEY_TARGET_UPDATED_AT, 0L)
        return updatedAt > 0L && System.currentTimeMillis() - updatedAt > TARGET_MAX_AGE_MS
    }

    private fun targetText(): String {
        return when {
            setupUpper > 0.0 && setupLower > 0.0 ->
                "Area SELL ${fmt(setupUpper)} • BUY ${fmt(setupLower)}."
            setupUpper > 0.0 -> "Area SELL ${fmt(setupUpper)} dipantau."
            setupLower > 0.0 -> "Area BUY ${fmt(setupLower)} dipantau."
            else -> "Belum ada area M15 aktif; news tetap dipantau."
        }
    }

    private fun canPostNotifications(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun prefs() =
        getSharedPreferences("AmyFXPrefs", Context.MODE_PRIVATE)

    private fun notificationManager() =
        getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private fun fmt(value: Double) =
        String.format(Locale.US, "%.2f", value)

    override fun onDestroy() {
        marketJob?.cancel()
        newsJob?.cancel()
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP_SCANNER = "com.amyelitesuite.action.STOP_SCANNER"

        private const val MARKET_URL =
            "https://amy-fx.vercel.app/api/twelvedata?symbol=XAU/USD&interval=1min&outputsize=1"
        private const val NEWS_URL = "https://amy-fx.vercel.app/api/news"
        private const val MARKET_POLL_MS = 10_000L
        private const val NEWS_POLL_MS = 120_000L
        private const val STATUS_UPDATE_MIN_MS = 15_000L
        private const val TARGET_MAX_AGE_MS = 24L * 60L * 60L * 1000L
        private const val RESET_DISTANCE = 0.50
        private const val PRICE_EPSILON = 0.01
        private const val MAX_NEWS_BODY = 900

        private const val KEY_SCANNER_ENABLED = "scanner_enabled"
        private const val KEY_BSL_TARGET = "scanner_bsl_target"
        private const val KEY_SSL_TARGET = "scanner_ssl_target"
        private const val KEY_TARGET_UPDATED_AT = "scanner_target_updated_at"
        private const val KEY_UPPER_ARMED = "scanner_upper_armed"
        private const val KEY_LOWER_ARMED = "scanner_lower_armed"
        private const val KEY_LAST_NEWS_ID = "scanner_last_news_id"

        private const val CHANNEL_SCANNER_FOREGROUND = "amy_scanner_foreground_v3"
        private const val CHANNEL_TARGET_ALERT = "amy_target_alert_v4"
        private const val CHANNEL_NEWS = "amy_news_v1"
        private const val FOREGROUND_NOTIFICATION_ID = 9101
        private const val TARGET_NOTIFICATION_BASE_ID = 9200
    }
}

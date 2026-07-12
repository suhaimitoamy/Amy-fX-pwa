package com.amyelitesuite

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.PowerManager
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebChromeClient.FileChooserParams
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.webkit.WebViewAssetLoader
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import org.json.JSONArray
import org.json.JSONObject

private const val APP_ASSET_HOST = "appassets.androidplatform.net"
private const val APP_ASSET_PREFIX = "https://appassets.androidplatform.net/assets/"
private const val LEGACY_ASSET_PREFIX = "file:///android_asset/"
private const val HOME_URL = "${APP_ASSET_PREFIX}index.html"
private const val ERROR_URL = "${APP_ASSET_PREFIX}error.html"

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader
    private lateinit var swipeRefreshLayout: SwipeRefreshLayout
    private lateinit var rootLayout: FrameLayout
    private lateinit var permissionGate: LinearLayout
    private lateinit var batteryStatusText: TextView
    private lateinit var notificationStatusText: TextView
    private lateinit var scannerStatusText: TextView
    private lateinit var manageFilesStatusText: TextView
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private val FILE_CHOOSER_REQUEST_CODE = 100
    private val NOTIFICATION_REQUEST_CODE = 2
    private val MANAGE_FILES_REQUEST_CODE = 3

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val matchParentParams = android.view.ViewGroup.LayoutParams(
            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
            android.view.ViewGroup.LayoutParams.MATCH_PARENT
        )

        createNotificationChannels()

        rootLayout = FrameLayout(this)
        rootLayout.layoutParams = matchParentParams

        swipeRefreshLayout = SwipeRefreshLayout(this)
        swipeRefreshLayout.layoutParams = matchParentParams

        webView = WebView(this)
        webView.layoutParams = matchParentParams
        swipeRefreshLayout.addView(webView)
        rootLayout.addView(swipeRefreshLayout)

        permissionGate = buildPermissionGate()
        rootLayout.addView(permissionGate)

        setContentView(rootLayout)

        val webSettings: WebSettings = webView.settings
        webSettings.javaScriptEnabled = true
        webSettings.domStorageEnabled = true
        webSettings.loadWithOverviewMode = true
        webSettings.useWideViewPort = true
        webSettings.cacheMode = WebSettings.LOAD_DEFAULT
        webSettings.allowFileAccess = false
        webSettings.allowContentAccess = true
        webSettings.allowFileAccessFromFileURLs = false
        webSettings.allowUniversalAccessFromFileURLs = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            webSettings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        assetLoader = WebViewAssetLoader.Builder()
            .setDomain(APP_ASSET_HOST)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.addJavascriptInterface(WebAppInterface(this), "Android")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                if (BuildConfig.DEBUG && consoleMessage != null) {
                    android.util.Log.d("AmyFX-WebView", "${consoleMessage.message()} @ ${consoleMessage.sourceId()}:${consoleMessage.lineNumber()}")
                }
                return true
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = filePathCallback

                val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }

                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE)
                } catch (e: ActivityNotFoundException) {
                    fileUploadCallback = null
                    Toast.makeText(this@MainActivity, "Cannot Open File Chooser", Toast.LENGTH_LONG).show()
                    return false
                }
                return true
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val uri = request?.url ?: return super.shouldInterceptRequest(view, request)
                return assetLoader.shouldInterceptRequest(uri)
                    ?: super.shouldInterceptRequest(view, request)
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val uri = request?.url ?: return true
                if (isTrustedLocalUri(uri)) return false
                if (uri.scheme == "https" || uri.scheme == "http") {
                    try { startActivity(Intent(Intent.ACTION_VIEW, uri)) } catch (_: Exception) {}
                }
                return true
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                swipeRefreshLayout.isRefreshing = false
                injectHomeButtonForLocalModule(url)
                applyAmyFxRoute(this@MainActivity.intent?.getStringExtra("amyfx_route"))
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request?.isForMainFrame == true) {
                    swipeRefreshLayout.isRefreshing = false
                    view?.loadUrl(ERROR_URL)
                }
            }
        }

        swipeRefreshLayout.setOnRefreshListener {
            webView.reload()
        }

        webView.setDownloadListener { url, userAgent, contentDisposition, mimetype, contentLength ->
            if (url.startsWith("blob:")) {
                webView.evaluateJavascript("""
                    fetch('$url')
                        .then(res => res.blob())
                        .then(blob => {
                            var reader = new FileReader();
                            reader.readAsDataURL(blob);
                            reader.onloadend = function() {
                                Android.saveBlob(reader.result, 'Trading_Report_${System.currentTimeMillis()}.pdf');
                            }
                        });
                """.trimIndent(), null)
                Toast.makeText(this, "Generating PDF...", Toast.LENGTH_SHORT).show()
            } else if (url.startsWith("http")) {
                try {
                    val request = DownloadManager.Request(Uri.parse(url))
                    request.setMimeType(mimetype)
                    request.addRequestHeader("User-Agent", userAgent)
                    request.setDescription("Downloading file...")
                    request.setTitle("Amy FX Download")
                    request.allowScanningByMediaScanner()
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "Amy_Elite_Download_${System.currentTimeMillis()}")
                    val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                    dm.enqueue(request)
                    Toast.makeText(this, "Downloading File...", Toast.LENGTH_LONG).show()
                } catch (e: Exception) {
                    Toast.makeText(this, "Download failed", Toast.LENGTH_SHORT).show()
                }
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), 1)
            }
        }

        val targetUrl = normalizeLocalUrl(intent.getStringExtra("target_url")) ?: HOME_URL
        webView.loadUrl(targetUrl)

        updatePermissionGate()
        maybeRequestNotificationPermission()
    }

    override fun onPause() {
        if (::webView.isInitialized) webView.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) webView.onResume()
        updatePermissionGate()
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= TRIM_MEMORY_RUNNING_LOW && ::webView.isInitialized) {
            webView.clearCache(false)
        }
    }

    override fun onLowMemory() {
        if (::webView.isInitialized) webView.clearCache(false)
        super.onLowMemory()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == NOTIFICATION_REQUEST_CODE) {
            updatePermissionGate()
        }
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "amy_heads_up_v5",
                "Amy FX Heads-Up Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "High priority trading signals"
                enableLights(true)
                lightColor = Color.GREEN
                enableVibration(true)
                val audioAttributes = android.media.AudioAttributes.Builder()
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
                    .build()
                setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), audioAttributes)
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildPermissionGate(): LinearLayout {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.rgb(10, 10, 10))
            setPadding(dp(22), dp(22), dp(22), dp(22))
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }

        val title = TextView(this).apply {
            text = "Amy FX Permission Center"
            setTextColor(Color.rgb(212, 175, 55))
            textSize = 22f
            gravity = Gravity.CENTER
        }

        val subtitle = TextView(this).apply {
            text = "Aktifkan izin wajib agar scanner dan notifikasi tetap hidup di background."
            setTextColor(Color.WHITE)
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(0, dp(10), 0, dp(20))
        }

        batteryStatusText = statusText()
        notificationStatusText = statusText()
        scannerStatusText = statusText()

        val batteryButton = goldButton("Buka Battery Optimization") {
            openBatteryOptimizationRequest()
        }

        val notificationButton = goldButton("Aktifkan Notifikasi") {
            requestNotificationPermission()
        }

        // manageFilesButton removed as MediaStore is used
        val appSettingsButton = darkButton("Buka Detail Aplikasi") {
            openAppSettings()
        }

        val recheckButton = darkButton("Cek Ulang Izin") {
            updatePermissionGate(true)
        }

        container.addView(title)
        container.addView(subtitle)
        container.addView(batteryStatusText)
        container.addView(notificationStatusText)
        container.addView(scannerStatusText)
        container.addView(batteryButton)
        container.addView(notificationButton)
        // container.addView(manageFilesButton)
        container.addView(appSettingsButton)
        container.addView(recheckButton)

        return container
    }

    private fun statusText(): TextView {
        return TextView(this).apply {
            setTextColor(Color.WHITE)
            textSize = 15f
            setPadding(0, dp(6), 0, dp(6))
            gravity = Gravity.CENTER
        }
    }

    private fun goldButton(label: String, action: () -> Unit): Button {
        return Button(this).apply {
            text = label
            setTextColor(Color.BLACK)
            setBackgroundColor(Color.rgb(212, 175, 55))
            setOnClickListener { action() }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { setMargins(0, dp(10), 0, 0) }
        }
    }

    private fun darkButton(label: String, action: () -> Unit): Button {
        return Button(this).apply {
            text = label
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.rgb(35, 35, 35))
            setOnClickListener { action() }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { setMargins(0, dp(10), 0, 0) }
        }
    }

    private fun updatePermissionGate(forceToast: Boolean = false) {
        if (!::permissionGate.isInitialized) return

        val batteryOk = isBatteryOptimizationDisabled()
        val notificationOk = isNotificationPermissionGranted()

        batteryStatusText.text = if (batteryOk) "✅ Battery Optimization: Unrestricted" else "⚠️ Battery Optimization: belum Unrestricted"
        notificationStatusText.text = if (notificationOk) "✅ Notifikasi: aktif" else "⚠️ Notifikasi: belum aktif"
        scannerStatusText.text = if (notificationOk) "✅ Scanner: bisa jalan" else "⛔ Scanner: butuh izin notifikasi"

        // Izin background tidak boleh memblokir halaman Mapping atau modul lain.
        permissionGate.visibility = View.GONE
        swipeRefreshLayout.isEnabled = true

        if (forceToast) {
            val message = if (notificationOk && batteryOk) {
                "Notifikasi dan background scanner siap."
            } else {
                "Aplikasi tetap bisa dipakai. Lengkapi izin hanya untuk notifikasi dan scanner background."
            }
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
        }
    }

    private fun isNotificationPermissionGranted(): Boolean {
        return if (Build.VERSION.SDK_INT >= 33) {
            checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    private fun isBatteryOptimizationDisabled(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    private fun hasRequiredPermissions(): Boolean {
        return isNotificationPermissionGranted()
    }

    private fun isManageAllFilesGranted(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            true
        }
    }

    private fun maybeRequestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && !isNotificationPermissionGranted()) {
            requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), NOTIFICATION_REQUEST_CODE)
        }
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && !isNotificationPermissionGranted()) {
            requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), NOTIFICATION_REQUEST_CODE)
        } else {
            updatePermissionGate(true)
        }
    }

    private fun openBatteryOptimizationRequest() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            updatePermissionGate(true)
            return
        }
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
            }
            startActivity(intent)
        } catch (e: Exception) {
            openAppSettings()
        }
    }

    private fun openManageAllFilesAccess() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            updatePermissionGate(true)
            return
        }
        try {
            val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                data = Uri.parse("package:$packageName")
            }
            startActivity(intent)
        } catch (e: Exception) {
            try {
                startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
            } catch (ex: Exception) {
                openAppSettings()
            }
        }
    }

    private fun openAppSettings() {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$packageName")
            }
            startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(this, "Buka Settings > Apps > Amy FX", Toast.LENGTH_LONG).show()
        }
    }

    private fun openManageAllFilesSettingsInternal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            openAppSettings()
            return
        }
        try {
            val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                data = Uri.parse("package:$packageName")
            }
            startActivity(intent)
        } catch (e: Exception) {
            try {
                startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
            } catch (ignored: Exception) {
                openAppSettings()
            }
        }
    }

    private fun isTrustedLocalUri(uri: Uri): Boolean {
        return uri.scheme == "https" &&
            uri.host == APP_ASSET_HOST &&
            uri.path?.startsWith("/assets/") == true
    }

    private fun normalizeLocalUrl(rawUrl: String?): String? {
        if (rawUrl.isNullOrBlank()) return null
        return when {
            rawUrl.startsWith(APP_ASSET_PREFIX) -> rawUrl
            rawUrl.startsWith(LEGACY_ASSET_PREFIX) ->
                APP_ASSET_PREFIX + rawUrl.removePrefix(LEGACY_ASSET_PREFIX)
            else -> null
        }
    }

    private fun injectHomeButtonForLocalModule(url: String?) {
        if (url == null || !url.contains("/apps/")) return
        webView.evaluateJavascript("""
            (function(){
              if (document.getElementById('amy-fx-home-button')) return;
              var btn = document.createElement('button');
              btn.id = 'amy-fx-home-button';
              btn.textContent = '← Amy FX';
              btn.style.position = 'fixed';
              btn.style.left = '12px';
              btn.style.bottom = '80px';
              btn.style.zIndex = '2147483647';
              btn.style.border = '1px solid rgba(212,175,55,.55)';
              btn.style.borderRadius = '999px';
              btn.style.background = 'rgba(10,10,10,.88)';
              btn.style.color = '#d4af37';
              btn.style.fontWeight = '800';
              btn.style.fontSize = '12px';
              btn.style.padding = '8px 12px';
              btn.style.boxShadow = '0 6px 18px rgba(0,0,0,.35)';
              btn.onclick = function(){ if (window.Android && window.Android.goHome) { window.Android.goHome(); } else { location.href = '${APP_ASSET_PREFIX}index.html'; } };
              document.body.appendChild(btn);
              document.body.style.setProperty('--amy-native-back-height','28px');
            })();
        """.trimIndent(), null)
    }

    private fun dp(value: Int): Int {
        return (value * resources.displayMetrics.density).toInt()
    }

    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        normalizeLocalUrl(intent?.getStringExtra("target_url"))?.let { targetUrl ->
            if (webView.url != targetUrl) webView.loadUrl(targetUrl)
        }
        applyAmyFxRoute(intent?.getStringExtra("amyfx_route"))
    }

    private fun applyAmyFxRoute(route: String?) {
        val safeRoute = when (route) {
            "Dashboard", "Analyze", "Setups", "History", "Settings" -> route
            else -> return
        }
        if (!::webView.isInitialized) return
        webView.post {
            webView.evaluateJavascript(
                "(function(){try{localStorage.setItem('amyfx.notification.route','$safeRoute');if(typeof setTab==='function')setTab('$safeRoute');}catch(e){}})();",
                null
            )
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            if (fileUploadCallback == null) return
            val result = WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            fileUploadCallback?.onReceiveValue(result)
            fileUploadCallback = null
        } else {
            super.onActivityResult(requestCode, resultCode, data)
        }
    }

    inner class WebAppInterface(private val mContext: Context) {
        @JavascriptInterface
        fun goHome() {
            (mContext as Activity).runOnUiThread {
                this@MainActivity.webView.loadUrl(HOME_URL)
            }
        }

        @JavascriptInterface
        fun openManageFilesPermission() {
            (mContext as Activity).runOnUiThread {
                this@MainActivity.openManageAllFilesAccess()
            }
        }

        @JavascriptInterface
        fun showAppToast(message: String) {
            (mContext as Activity).runOnUiThread {
                Toast.makeText(mContext, message, Toast.LENGTH_SHORT).show()
            }
        }

        @JavascriptInterface
        fun openManageAllFilesSettings() {
            (mContext as Activity).runOnUiThread {
                this@MainActivity.openManageAllFilesSettingsInternal()
            }
        }

        @JavascriptInterface
        fun triggerHaptic(pattern: Int) {
            try {
                val vibrator = mContext.getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(android.os.VibrationEffect.createOneShot(pattern.toLong(), android.os.VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator.vibrate(pattern.toLong())
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        @JavascriptInterface
        fun startBackgroundScanner(apiKey: String?, bsl: String?, ssl: String?) {
            try {
                if (!this@MainActivity.hasRequiredPermissions()) {
                    (mContext as Activity).runOnUiThread {
                        this@MainActivity.maybeRequestNotificationPermission()
                        Toast.makeText(mContext, "Aktifkan izin notifikasi agar alert mengambang muncul.", Toast.LENGTH_LONG).show()
                    }
                    return
                }

                val prefs = mContext.getSharedPreferences("AmyFXPrefs", Context.MODE_PRIVATE)
                val cleanedApiKey = apiKey?.trim()
                val storedApiKey = prefs.getString("api_key", null)
                if (!cleanedApiKey.isNullOrBlank() && cleanedApiKey != "undefined" && cleanedApiKey != "null") {
                    prefs.edit().putString("api_key", cleanedApiKey).putBoolean("scanner_enabled", true).apply()
                    SecurePrefs.putString(mContext, "api_key", cleanedApiKey)
                } else if (storedApiKey.isNullOrBlank() && SecurePrefs.getString(mContext, "api_key", null).isNullOrBlank()) {
                    (mContext as Activity).runOnUiThread {
                        Toast.makeText(mContext, "API key belum tersedia. Buka Mapping > Settings lalu Save & Connect dulu.", Toast.LENGTH_LONG).show()
                    }
                    return
                } else {
                    prefs.edit().putBoolean("scanner_enabled", true).apply()
                }
                val cleanBsl = bsl?.trim()?.takeIf { it.isNotBlank() && it != "undefined" && it != "null" }
                val cleanSsl = ssl?.trim()?.takeIf { it.isNotBlank() && it != "undefined" && it != "null" }
                prefs.edit().apply {
                    if (cleanBsl != null) putString("scanner_bsl_target", cleanBsl)
                    if (cleanSsl != null) putString("scanner_ssl_target", cleanSsl)
                }.apply()
                val intent = Intent(mContext, ScannerService::class.java).apply {
                    putExtra("bsl", cleanBsl)
                    putExtra("ssl", cleanSsl)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    mContext.startForegroundService(intent)
                } else {
                    mContext.startService(intent)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        @JavascriptInterface
        fun stopBackgroundScanner() {
            try {
                mContext.getSharedPreferences("AmyFXPrefs", Context.MODE_PRIVATE)
                    .edit().putBoolean("scanner_enabled", false).apply()
                val intent = Intent(mContext, ScannerService::class.java)
                intent.action = "STOP_SCANNER"
                mContext.startService(intent)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        @JavascriptInterface
        fun getNativeCandles(symbol: String?, timeframe: String?, limit: String?): String {
            return try {
                val safeSymbol = if (symbol.isNullOrBlank() || symbol == "undefined") "XAU/USD" else symbol
                val safeTimeframe = if (timeframe.isNullOrBlank() || timeframe == "undefined") "M5" else timeframe
                val safeLimit = limit?.toIntOrNull()?.coerceIn(1, 1000) ?: 300
                val rows = CandleStore(mContext).getLatest(safeSymbol, safeTimeframe, safeLimit)
                val arr = JSONArray()
                rows.forEach { c ->
                    val obj = JSONObject()
                    obj.put("symbol", c.symbol)
                    obj.put("timeframe", c.timeframe)
                    obj.put("time", c.openTime)
                    obj.put("open_time", c.openTime)
                    obj.put("close_time", c.closeTime)
                    obj.put("open", c.open)
                    obj.put("high", c.high)
                    obj.put("low", c.low)
                    obj.put("close", c.close)
                    obj.put("tickCount", c.volumeTick)
                    obj.put("isClosed", c.isClosed)
                    arr.put(obj)
                }
                arr.toString()
            } catch (e: Exception) {
                "[]"
            }
        }

        @JavascriptInterface
        fun clearWebViewCache() {
            (mContext as Activity).runOnUiThread {
                this@MainActivity.webView.clearCache(true)
                Toast.makeText(mContext, "Cache WebView dibersihkan", Toast.LENGTH_SHORT).show()
            }
        }

        @JavascriptInterface
        fun getScannerHealth(): String {
            val prefs = mContext.getSharedPreferences("AmyFXPrefs", Context.MODE_PRIVATE)
            val enabled = prefs.getBoolean("scanner_enabled", false)
            val targetAt = prefs.getLong("scanner_target_updated_at", 0L)
            val bsl = prefs.getString("scanner_bsl_target", "")
            val ssl = prefs.getString("scanner_ssl_target", "")
            return JSONObject()
                .put("enabled", enabled)
                .put("targetUpdatedAt", targetAt)
                .put("bsl", bsl)
                .put("ssl", ssl)
                .toString()
        }

        @JavascriptInterface
        fun showNotification(title: String, message: String) {
            showNotificationWithUrl(title, message, null)
        }

        @JavascriptInterface
        fun showNotificationWithUrl(title: String, message: String, url: String?) {
            try {
                val route = AmyFxNotificationGate.routeFor(title, message)
                val intent = Intent(mContext, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    val destination = url ?: AmyFxNotificationGate.routeUrl(route)
                    val routedUrl = if (destination.contains("apps/mapping/index.html") && !destination.contains("#")) "$destination#$route" else destination
                    putExtra("target_url", routedUrl)
                    putExtra("amyfx_route", route)
                }
                val requestCode = System.currentTimeMillis().toInt()
                val pendingIntent = PendingIntent.getActivity(
                    mContext, requestCode, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )

                val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    Notification.Builder(mContext, "amy_heads_up_v5")
                } else {
                    @Suppress("DEPRECATION")
                    Notification.Builder(mContext)
                        .setPriority(Notification.PRIORITY_HIGH)
                }

                val notification = builder
                    .setSmallIcon(android.R.drawable.ic_dialog_alert)
                    .setContentTitle(title)
                    .setContentText(message)
                    .setStyle(Notification.BigTextStyle().bigText(message))
                    .setAutoCancel(true)
                    .setContentIntent(pendingIntent)
                    .setCategory(Notification.CATEGORY_ALARM)
                    .setPriority(Notification.PRIORITY_MAX)
                    .setVisibility(Notification.VISIBILITY_PUBLIC)
                    .setDefaults(Notification.DEFAULT_ALL)
                    .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
                    .setVibrate(longArrayOf(0, 500, 250, 500))
                    .build()

                val nm = mContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                val gateKey = "global|" + title + "|" + message
                if (AmyFxNotificationGate.shouldNotify(applicationContext, gateKey, System.currentTimeMillis())) {
                    nm.notify(AmyFxNotificationGate.stableId(gateKey, requestCode), notification)
                } // AMYFX_NOTIFY_NATIVE_FIX
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        private var currentFileOutputStream: OutputStream? = null

        @JavascriptInterface
        fun startFile(filename: String) {
            try {
                currentFileOutputStream = openDownloadOutputStream(filename, "application/octet-stream")
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        @JavascriptInterface
        fun appendFileChunk(base64Chunk: String) {
            try {
                val cleanBase64 = base64Chunk.replaceFirst("^data:.*?;base64,".toRegex(), "")
                val fileAsBytes = Base64.decode(cleanBase64, 0)
                currentFileOutputStream?.write(fileAsBytes)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        @JavascriptInterface
        fun finishFile() {
            try {
                val os = currentFileOutputStream ?: throw IllegalStateException("Output stream belum siap")
                os.flush()
                os.close()
                currentFileOutputStream = null
                (mContext as Activity).runOnUiThread {
                    Toast.makeText(mContext, "File tersimpan di folder Download", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                (mContext as Activity).runOnUiThread {
                    Toast.makeText(mContext, "Gagal menyimpan file", Toast.LENGTH_LONG).show()
                }
            }
        }

        @JavascriptInterface
        fun saveBlob(base64Data: String, filename: String) {
            try {
                val cleanBase64 = base64Data.replaceFirst("^data:.*?;base64,".toRegex(), "")
                val fileAsBytes = Base64.decode(cleanBase64, 0)

                val os = openDownloadOutputStream(filename, "application/pdf") ?: throw IllegalStateException("Gagal membuat file")
                os.write(fileAsBytes)
                os.flush()
                os.close()

                (mContext as Activity).runOnUiThread {
                    Toast.makeText(mContext, "File tersimpan di folder Download", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                (mContext as Activity).runOnUiThread {
                    Toast.makeText(mContext, "Gagal menyimpan file", Toast.LENGTH_LONG).show()
                }
            }
        }

        private fun openDownloadOutputStream(filename: String, mimeType: String): OutputStream? {
            val safeName = filename.replace(Regex("[\\/:*?\"<>|]"), "_").ifBlank { "Amy_FX_File_${System.currentTimeMillis()}" }
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, safeName)
                    put(MediaStore.Downloads.MIME_TYPE, mimeType)
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                    put(MediaStore.Downloads.IS_PENDING, 0)
                }
                val uri = mContext.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                uri?.let { mContext.contentResolver.openOutputStream(it) }
            } else {
                val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                if (!downloadsDir.exists()) downloadsDir.mkdirs()
                FileOutputStream(File(downloadsDir, safeName), false)
            }
        }
    }
}

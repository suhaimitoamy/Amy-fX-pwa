package com.amyelitesuite

import android.app.Application
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class AmyFxApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        getSharedPreferences("AmyFXPrefs", Context.MODE_PRIVATE)
            .edit()
            .putBoolean("scanner_enabled", true)
            .apply()

        FcmDeviceRegistrar.registerCurrentToken(this)
        startAutomaticMonitor()
    }

    private fun startAutomaticMonitor() {
        try {
            val intent = Intent(this, ScannerService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
        } catch (error: Exception) {
            Log.w("AmyFX", "Automatic monitor start deferred", error)
        }
    }
}

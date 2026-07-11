package com.amyelitesuite

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class AmyFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        FcmDeviceRegistrar.register(this, token, force = true)
    }

    override fun onDeletedMessages() {
        super.onDeletedMessages()
        FcmDeviceRegistrar.registerCurrentToken(this, force = true)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val data = message.data
        val newsId = data["news_id"] ?: data["id"] ?: ""
        val title = message.notification?.title
            ?: data["title"]
            ?: "Breaking News XAU/USD"
        val body = message.notification?.body
            ?: data["body"]
            ?: data["text"]
            ?: "Berita baru telah tersedia."
        val suppliedTarget = data["target_url"].orEmpty()

        val targetUrl = when {
            suppliedTarget.startsWith("https://appassets.androidplatform.net/assets/apps/market-intel/") -> suppliedTarget
            newsId.isNotBlank() -> {
                "https://appassets.androidplatform.net/assets/apps/market-intel/index.html#news=${Uri.encode(newsId)}"
            }
            else -> "https://appassets.androidplatform.net/assets/apps/market-intel/index.html"
        }

        showNewsNotification(title, body, newsId, targetUrl)
    }

    private fun showNewsNotification(
        title: String,
        body: String,
        newsId: String,
        targetUrl: String
    ) {
        val channelId = "amy_news_v1"
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Amy FX Breaking News",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Breaking news yang relevan untuk XAU/USD"
                enableLights(true)
                lightColor = Color.YELLOW
                enableVibration(true)
            }
            manager.createNotificationChannel(channel)
        }

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("target_url", targetUrl)
        }
        val requestCode = if (newsId.isBlank()) {
            System.currentTimeMillis().toInt()
        } else {
            newsId.hashCode()
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        manager.notify(requestCode, notification)
    }
}

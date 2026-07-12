package com.amyelitesuite;

import android.app.Notification;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;

public class AmyFxNotificationGate {
    private static final String PREF = "amyfx_notify_gate";
    private static final String KEY_ROUTES = "known_routes_v1";
    private static final String KEY_COOLDOWNS = "cooldowns_v1";
    private static final long DEFAULT_COOLDOWN_MS = 30L * 60L * 1000L; // 30 minutes

    private AmyFxNotificationGate() {}

    public static String routeFor(String title, String message) {
        if (title == null) title = "";
        if (message == null) message = "";
        String t = title.toLowerCase(java.util.Locale.ROOT);
        String m = message.toLowerCase(java.util.Locale.ROOT);
        if (t.contains("news") || t.contains("berita") || m.contains("breaking news")) return "News";
        if (t.contains("journal") || t.contains("jurnal")) return "Journal";
        if (t.contains("academy") || t.contains("akademi")) return "Academy";
        if (t.contains("target atas") || m.contains("bsl")) return "Analyze";
        if (t.contains("target bawah") || m.contains("ssl")) return "Analyze";
        if (t.contains("scanner") || m.contains("scanner")) return "Analyze";
        if (t.contains("kills zone") || t.contains("session")) return "Dashboard";
        return "Analyze";
    }

    public static String routeUrl(String route) {
        if ("News".equals(route)) return "https://appassets.androidplatform.net/assets/apps/market-intel/index.html#news";
        if ("Journal".equals(route)) return "https://appassets.androidplatform.net/assets/apps/journal/index.html";
        if ("Academy".equals(route)) return "https://appassets.androidplatform.net/assets/apps/academy/index.html";
        return "https://appassets.androidplatform.net/assets/apps/mapping/index.html#" + Uri.encode(route);
    }

    public static boolean shouldNotify(Context context, String gateKey, long nowMs) {
        if (gateKey == null || gateKey.isEmpty()) return true;
        SharedPreferences sp = context.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        long last = sp.getLong(KEY_COOLDOWNS + ":" + safeKey(gateKey), 0L);
        boolean allowed = nowMs - last >= DEFAULT_COOLDOWN_MS || last == 0L;
        if (allowed) {
            markNotified(context, gateKey, nowMs);
        }
        return allowed;
    }

    public static int stableId(String gateKey, int requestCode) {
        if (gateKey == null || gateKey.isEmpty()) return Math.abs(requestCode % 100000);
        int h = 0;
        for (int i = 0; i < gateKey.length(); i++) {
            h = 31 * h + gateKey.charAt(i);
        }
        return Math.abs((requestCode + h) % 100000);
    }

    public static void markNotified(Context context, String gateKey, long nowMs) {
        if (gateKey == null || gateKey.isEmpty()) return;
        SharedPreferences sp = context.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        sp.edit().putLong(KEY_COOLDOWNS + ":" + safeKey(gateKey), nowMs).apply();
    }

    public static PendingIntent clickIntent(Context context, String title, String message) {
        String route = routeFor(title, message);
        String url = routeUrl(route);
        Intent intent = new Intent("amyfx.intent.action.OPEN_ROUTE");
        intent.setPackage(context.getPackageName());
        intent.putExtra("amyfx_route", route);
        intent.putExtra("target_url", url);
        intent.setData(Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, stableId(title + "|" + message, (int) System.currentTimeMillis()), intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static String safeKey(String key) {
        String k = key.replace("/", "");
        k = k.replace(":", "");
        return k.length() > 120 ? k.substring(0, 120) : k;
    }
}

/**
 * Amy FX Academy Learning Reminder Service
 * Manages daily skill improvement reminders, tracking the last studied material
 * and allowing the user to customize reminder time from their Profile.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY_ENABLED = 'amy_learning_reminder_enabled';
  var STORAGE_KEY_TIME = 'amy_learning_reminder_time';
  var STORAGE_KEY_LAST_NOTIFIED = 'amy_learning_reminder_last_date';
  var DEFAULT_TIME = '20:00';
  var DEFAULT_TITLE = 'Fondasi ICT & Market Structure Dasar';
  var DEFAULT_URL = 'https://appassets.androidplatform.net/assets/apps/academy/index.html';

  function getLocalTimeHHMM() {
    var now = new Date();
    var h = String(now.getHours()).padStart(2, '0');
    var m = String(now.getMinutes()).padStart(2, '0');
    return h + ':' + m;
  }

  function getLocalDateString() {
    var now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  }

  function readJson(key, fallback) {
    try {
      var val = JSON.parse(localStorage.getItem(key) || 'null');
      return val == null ? fallback : val;
    } catch (_) {
      return fallback;
    }
  }

  var AmyLearningReminder = {
    DEFAULT_TIME: DEFAULT_TIME,
    DEFAULT_TITLE: DEFAULT_TITLE,

    getConfig: function () {
      var enabled = localStorage.getItem(STORAGE_KEY_ENABLED) !== 'false';
      var time = localStorage.getItem(STORAGE_KEY_TIME) || DEFAULT_TIME;

      // Last studied lesson details from Academy reading history
      var lastRead = readJson('amy_academy_last_read_v2', null);
      var lastTitle = (lastRead && lastRead.title) || localStorage.getItem('amy_last_opened_title') || '';
      var lastUrl = (lastRead && lastRead.path) || localStorage.getItem('amy_last_opened_url') || DEFAULT_URL;
      var lastTime = (lastRead && lastRead.updatedAt) || 0;

      // Check native config if available
      if (global.Android && typeof global.Android.getLearningReminderConfig === 'function') {
        try {
          var nativeConfig = JSON.parse(global.Android.getLearningReminderConfig() || '{}');
          if (nativeConfig.enabled !== undefined) enabled = Boolean(nativeConfig.enabled);
          if (nativeConfig.time) time = nativeConfig.time;
          if (nativeConfig.lastTitle && !lastTitle) lastTitle = nativeConfig.lastTitle;
          if (nativeConfig.lastUrl && (!lastUrl || lastUrl === DEFAULT_URL)) lastUrl = nativeConfig.lastUrl;
        } catch (_) {}
      }

      var lastTimeText = 'Belum ada riwayat belajar';
      if (lastTime) {
        try {
          lastTimeText = new Intl.DateTimeFormat('id-ID', {
            dateStyle: 'medium',
            timeStyle: 'short'
          }).format(new Date(lastTime));
        } catch (_) {
          lastTimeText = new Date(lastTime).toLocaleString('id-ID');
        }
      }

      return {
        enabled: enabled,
        time: time,
        lastTitle: lastTitle || DEFAULT_TITLE,
        lastUrl: lastUrl,
        lastTime: lastTime,
        lastTimeText: lastTimeText
      };
    },

    saveConfig: function (enabled, timeOfDay) {
      var cleanTime = String(timeOfDay || '').trim();
      if (!/^\d{1,2}:\d{2}$/.test(cleanTime)) {
        cleanTime = DEFAULT_TIME;
      }
      var parts = cleanTime.split(':');
      cleanTime = parts[0].padStart(2, '0') + ':' + parts[1].padStart(2, '0');

      localStorage.setItem(STORAGE_KEY_ENABLED, enabled ? 'true' : 'false');
      localStorage.setItem(STORAGE_KEY_TIME, cleanTime);

      if (global.Android && typeof global.Android.saveLearningReminderConfig === 'function') {
        try {
          global.Android.saveLearningReminderConfig(Boolean(enabled), cleanTime);
        } catch (e) {
          console.warn('Android saveLearningReminderConfig failed', e);
        }
      }

      return { enabled: Boolean(enabled), time: cleanTime };
    },

    recordLesson: function (title, url, section) {
      if (!title) return;
      var cleanTitle = String(title).replace(/\s+[—|-]\s+Tutorial Trading.*$/i, '').trim();
      var cleanUrl = String(url || DEFAULT_URL).trim();

      localStorage.setItem('amy_last_opened_title', cleanTitle);
      localStorage.setItem('amy_last_opened_url', cleanUrl);

      if (global.Android && typeof global.Android.recordLastStudiedLesson === 'function') {
        try {
          global.Android.recordLastStudiedLesson(cleanTitle, cleanUrl, String(section || ''));
        } catch (e) {
          console.warn('Android recordLastStudiedLesson failed', e);
        }
      }
    },

    formatNotification: function (customTitle) {
      var config = this.getConfig();
      var lessonTitle = customTitle || config.lastTitle || DEFAULT_TITLE;
      return {
        title: '📚 Waktunya Tingkatkan Skill Trading-mu!',
        message: 'Materi terakhir yang kamu pelajari: "' + lessonTitle + '". Yuk lanjutkan belajar sekarang!',
        url: config.lastUrl || DEFAULT_URL
      };
    },

    triggerReminderNotification: function () {
      var notif = this.formatNotification();

      // Native notification route
      if (global.Android && typeof global.Android.triggerLearningReminderNotification === 'function') {
        try {
          return global.Android.triggerLearningReminderNotification();
        } catch (e) {
          console.warn('triggerLearningReminderNotification failed', e);
        }
      }

      if (global.Android && typeof global.Android.showNotificationWithUrl === 'function') {
        try {
          global.Android.showNotificationWithUrl(notif.title, notif.message, notif.url);
          return true;
        } catch (e) {
          console.warn('showNotificationWithUrl failed', e);
        }
      }

      // Browser Notification fallback
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(notif.title, {
            body: notif.message,
            icon: '/favicon.ico'
          });
          return true;
        } catch (_) {}
      }

      // In-app fallback toast
      if (typeof global.showToast === 'function') {
        global.showToast(notif.title + '\n' + notif.message);
      }
      return true;
    },

    checkScheduledReminder: function () {
      var config = this.getConfig();
      if (!config.enabled) return;

      var currentHHMM = getLocalTimeHHMM();
      var todayDate = getLocalDateString();
      var lastNotified = localStorage.getItem(STORAGE_KEY_LAST_NOTIFIED);

      if (currentHHMM === config.time && lastNotified !== todayDate) {
        localStorage.setItem(STORAGE_KEY_LAST_NOTIFIED, todayDate);
        this.triggerReminderNotification();
      }
    },

    startScheduler: function () {
      if (this._schedulerStarted) return;
      this._schedulerStarted = true;

      var self = this;
      self.checkScheduledReminder();
      if (typeof setInterval !== 'undefined') {
        this._intervalId = setInterval(function () {
          self.checkScheduledReminder();
        }, 30000); // Check every 30 seconds
        if (this._intervalId && typeof this._intervalId.unref === 'function') {
          this._intervalId.unref();
        }
      }
    }
  };

  global.AmyLearningReminder = AmyLearningReminder;

  // Auto-start in-app scheduler
  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        AmyLearningReminder.startScheduler();
      });
    } else {
      AmyLearningReminder.startScheduler();
    }
  }

})(typeof window !== 'undefined' ? window : globalThis);
